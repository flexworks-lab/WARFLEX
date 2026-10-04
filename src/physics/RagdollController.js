import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);

function findWorldQuaternion(object) {
  return object.getWorldQuaternion(new THREE.Quaternion());
}

function findWorldPosition(object) {
  return object.getWorldPosition(new THREE.Vector3());
}

function setWorldTransform(object, position, quaternion) {
  const parent = object.parent;

  if (!parent) {
    object.position.copy(position);
    object.quaternion.copy(quaternion);
    return;
  }

  const worldMatrix = new THREE.Matrix4().compose(
    position,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );

  const inverseParent = new THREE.Matrix4()
    .copy(parent.matrixWorld)
    .invert();

  object.matrix.copy(inverseParent).multiply(worldMatrix);
  object.matrix.decompose(
    object.position,
    object.quaternion,
    object.scale,
  );
}

function cannonVec(v) {
  return new CANNON.Vec3(v.x, v.y, v.z);
}

function threeVec(v) {
  return new THREE.Vector3(v.x, v.y, v.z);
}

function cannonQuat(q) {
  return new CANNON.Quaternion(q.x, q.y, q.z, q.w);
}

function worldAxisLocal(body, worldAxis) {
  const inverse = body.quaternion.clone().inverse();
  return inverse.vmult(cannonVec(worldAxis));
}

function createSegmentBody({
  object,
  offset,
  halfExtents,
  mass,
  world,
  collisionGroup,
  scale = 1,
}) {
  const position = findWorldPosition(object);
  const quaternion = findWorldQuaternion(object);

  const body = new CANNON.Body({
    mass,
    position: cannonVec(position),
    quaternion: cannonQuat(quaternion),
    allowSleep: true,
    sleepSpeedLimit: 0.16,
    sleepTimeLimit: 0.75,
    linearDamping: 0.08,
    angularDamping: 0.12,
    collisionFilterGroup: collisionGroup,
    collisionFilterMask: 1,
  });

  body.addShape(
    new CANNON.Box(
      new CANNON.Vec3(
        halfExtents.x * scale,
        halfExtents.y * scale,
        halfExtents.z * scale,
      )
    ),
    cannonVec(
      offset.clone().multiplyScalar(scale),
    ),
  );

  world.addBody(body);

  body.userData = {
    object,
  };

  return body;
}

function connectBodies({
  world,
  parent,
  child,
  parentJointWorld,
  axisWorld,
  cone,
  twist,
}) {
  const pivotA = new CANNON.Vec3();
  const pivotB = new CANNON.Vec3();

  parent.pointToLocalFrame(
    cannonVec(parentJointWorld),
    pivotA,
  );

  child.pointToLocalFrame(
    cannonVec(parentJointWorld),
    pivotB,
  );

  const axisA = worldAxisLocal(parent, axisWorld);
  const axisB = worldAxisLocal(child, axisWorld);

  const constraint = new CANNON.ConeTwistConstraint(
    parent,
    child,
    {
      pivotA,
      pivotB,
      axisA,
      axisB,
      angle: cone,
      twistAngle: twist,
      collideConnected: false,
      maxForce: 1e6,
    },
  );

  world.addConstraint(constraint);
  return constraint;
}

function moveMeshAssemblyToHead(model) {
  const hips = model.userData.parts?.hips;
  const upperBody = model.userData.parts?.upperBody;
  const head = model.userData.parts?.head;

  if (!hips || !upperBody || !head) {
    return null;
  }

  const assembly = new THREE.Group();
  assembly.name = 'RagdollHeadAssembly';

  const worldHeadPosition = findWorldPosition(head);
  const worldHeadQuaternion = findWorldQuaternion(head);

  const parent = model.parent;
  parent.add(assembly);

  const localHeadPosition = parent.worldToLocal(
    worldHeadPosition.clone(),
  );

  const parentWorldQuaternion =
    parent.getWorldQuaternion(new THREE.Quaternion()).invert();

  assembly.position.copy(localHeadPosition);
  assembly.quaternion.copy(
    parentWorldQuaternion.multiply(worldHeadQuaternion),
  );

  const parts = [
    head,
    model.getObjectByName('Neck'),
    model.getObjectByName('JawShadow'),
    model.getObjectByName('LeftEyeline'),
    model.getObjectByName('RightEyeline'),
    model.getObjectByName('CombatHelmet'),
    model.getObjectByName('HelmetVisorFrame'),
    model.getObjectByName('HelmetVisor'),
    model.getObjectByName('HelmetRailLeft'),
    model.getObjectByName('HelmetRailRight'),
    model.getObjectByName('NVGMount'),
    model.getObjectByName('NVGRing'),
    model.getObjectByName('HeadsetLeft'),
    model.getObjectByName('HeadsetRight'),
    model.getObjectByName('HeadsetMic'),
  ].filter(Boolean);

  for (const part of parts) {
    assembly.attach(part);
  }

  return assembly;
}

function bodyForHitPart(ragdoll, hitPart) {
  const map = {
    head: 'head',
    leftArm: 'leftArm',
    rightArm: 'rightArm',
    leftLeg: 'leftLeg',
    rightLeg: 'rightLeg',
    upperBody: 'upperBody',
    lowerBody: 'root',
    body: 'upperBody',
  };

  return ragdoll.bodies.get(map[hitPart] || 'upperBody')
    || ragdoll.bodies.get('root');
}

export class RagdollController {
  constructor({
    scene,
    physicsWorld,
    cleanupSeconds = 10,
  }) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.world = physicsWorld.world;
    this.cleanupSeconds = cleanupSeconds;
    this.active = new Set();
  }

  create(enemy, {
    hitPoint,
    direction,
    headshot = false,
    hitPart = 'upperBody',
  } = {}) {
    const source = enemy?.group;
    if (!source) return null;

    source.updateMatrixWorld(true);

    const root = new THREE.Group();
    root.name = 'PhysicsRagdollRoot';
    root.position.copy(source.position);
    root.quaternion.copy(source.quaternion);
    root.scale.copy(source.scale);
    this.scene.add(root);

    source.position.set(0, 0, 0);
    source.quaternion.identity();
    source.scale.setScalar(1);
    root.add(source);

    const headAssembly = moveMeshAssemblyToHead(source);

    const parts = source.userData.parts;

    const bodies = new Map();
    const constraints = [];

    const collisionGroup = this.physicsWorld.ragdollGroup;

    const visualScale = Math.max(
      .01,
      Math.abs(root.scale.x),
    );

    const rootBody = createSegmentBody({
      object: root,
      offset: new THREE.Vector3(0, 0.82, 0),
      halfExtents: new THREE.Vector3(0.43, 0.55, 0.32),
      mass: 7,
      world: this.world,
      collisionGroup,
      scale: visualScale,
    });
    bodies.set('root', rootBody);

    const upperBody = parts?.upperBody;
    if (upperBody) {
      bodies.set('upperBody', createSegmentBody({
        object: upperBody,
        offset: new THREE.Vector3(0, 0.58, 0),
        halfExtents: new THREE.Vector3(0.49, 0.58, 0.34),
        mass: 5,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    const leftArm = parts?.leftArm;
    const rightArm = parts?.rightArm;

    if (leftArm) {
      bodies.set('leftArm', createSegmentBody({
        object: leftArm,
        offset: new THREE.Vector3(0, -0.34, 0),
        halfExtents: new THREE.Vector3(0.17, 0.35, 0.17),
        mass: 1.4,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    if (rightArm) {
      bodies.set('rightArm', createSegmentBody({
        object: rightArm,
        offset: new THREE.Vector3(0, -0.34, 0),
        halfExtents: new THREE.Vector3(0.17, 0.35, 0.17),
        mass: 1.4,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    const leftForearm = parts?.leftElbow;
    const rightForearm = parts?.rightElbow;

    if (leftForearm) {
      bodies.set('leftForearm', createSegmentBody({
        object: leftForearm,
        offset: new THREE.Vector3(0, -0.32, 0),
        halfExtents: new THREE.Vector3(0.16, 0.32, 0.16),
        mass: 1.0,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    if (rightForearm) {
      bodies.set('rightForearm', createSegmentBody({
        object: rightForearm,
        offset: new THREE.Vector3(0, -0.32, 0),
        halfExtents: new THREE.Vector3(0.16, 0.32, 0.16),
        mass: 1.0,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    const leftLeg = parts?.leftLeg;
    const rightLeg = parts?.rightLeg;
    const leftKnee = parts?.leftKnee;
    const rightKnee = parts?.rightKnee;

    if (leftLeg) {
      bodies.set('leftLeg', createSegmentBody({
        object: leftLeg,
        offset: new THREE.Vector3(0, -0.38, 0),
        halfExtents: new THREE.Vector3(0.22, 0.40, 0.22),
        mass: 4,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    if (rightLeg) {
      bodies.set('rightLeg', createSegmentBody({
        object: rightLeg,
        offset: new THREE.Vector3(0, -0.38, 0),
        halfExtents: new THREE.Vector3(0.22, 0.40, 0.22),
        mass: 4,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    if (leftKnee) {
      bodies.set('leftShin', createSegmentBody({
        object: leftKnee,
        offset: new THREE.Vector3(0, -0.34, 0),
        halfExtents: new THREE.Vector3(0.18, 0.36, 0.18),
        mass: 2.7,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    if (rightKnee) {
      bodies.set('rightShin', createSegmentBody({
        object: rightKnee,
        offset: new THREE.Vector3(0, -0.34, 0),
        halfExtents: new THREE.Vector3(0.18, 0.36, 0.18),
        mass: 2.7,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    if (headAssembly) {
      bodies.set('head', createSegmentBody({
        object: headAssembly,
        offset: new THREE.Vector3(0, 0, 0),
        halfExtents: new THREE.Vector3(0.27, 0.30, 0.24),
        mass: 2,
        world: this.world,
        collisionGroup,
        scale: visualScale,
      }));
    }

    const addConnection = (parentKey, childKey, jointName, cone, twist, objectKey = childKey) => {
      const parent = bodies.get(parentKey);
      const child = bodies.get(childKey);
      const childObject = child?.userData?.object;
      if (!parent || !child || !childObject) return;

      const jointWorld = findWorldPosition(childObject);
      const worldAxis = new THREE.Vector3(0, -1, 0)
        .applyQuaternion(findWorldQuaternion(childObject))
        .normalize();

      const constraint = connectBodies({
        world: this.world,
        parent,
        child,
        parentJointWorld: jointWorld,
        axisWorld: worldAxis,
        cone,
        twist,
      });

      constraints.push(constraint);
    };

    addConnection('root', 'upperBody', 'torso', Math.PI / 5, Math.PI / 7);
    addConnection('upperBody', 'leftArm', 'leftShoulder', Math.PI / 2, Math.PI / 4);
    addConnection('leftArm', 'leftForearm', 'leftElbow', Math.PI / 2, Math.PI / 8);
    addConnection('upperBody', 'rightArm', 'rightShoulder', Math.PI / 2, Math.PI / 4);
    addConnection('rightArm', 'rightForearm', 'rightElbow', Math.PI / 2, Math.PI / 8);
    addConnection('root', 'leftLeg', 'leftHip', Math.PI / 2.5, Math.PI / 5);
    addConnection('leftLeg', 'leftShin', 'leftKnee', Math.PI / 2, Math.PI / 10);
    addConnection('root', 'rightLeg', 'rightHip', Math.PI / 2.5, Math.PI / 5);
    addConnection('rightLeg', 'rightShin', 'rightKnee', Math.PI / 2, Math.PI / 10);

    if (bodies.has('upperBody') && bodies.has('head')) {
      addConnection('upperBody', 'head', 'neck', Math.PI / 4, Math.PI / 6);
    }

    const ragdoll = {
      root,
      model: source,
      headAssembly,
      bodies,
      constraints,
      meshes: [],
      createdAt: performance.now(),
      cleanupSeconds: this.cleanupSeconds,
      sleep: false,
    };

    for (const mesh of [source, headAssembly].filter(Boolean)) {
      mesh.traverse((object) => {
        if (!object.isMesh) return;

        object.userData.ragdoll = ragdoll;

        if (object.userData.enemy) {
          object.userData.enemy.dying = true;
        }

        object.frustumCulled = false;
        ragdoll.meshes.push(object);
      });
    }

    if (hitPoint && direction) {
      this.applyBulletImpulse(
        ragdoll,
        hitPoint,
        direction,
        headshot ? 7.5 : 5.5,
        hitPart,
      );
    }

    this.active.add(ragdoll);

    return ragdoll;
  }

  applyBulletImpulse(ragdoll, hitPoint, direction, strength, hitPart = 'upperBody') {
    if (!ragdoll) return;

    const body = bodyForHitPart(
      ragdoll,
      hitPart,
    );

    if (!body) return;

    const impulse = cannonVec(
      direction.clone()
        .normalize()
        .multiplyScalar(strength),
    );

    const worldPoint = cannonVec(hitPoint);
    const localPoint = new CANNON.Vec3();

    body.pointToLocalFrame(
      worldPoint,
      localPoint,
    );

    body.applyImpulse(
      impulse,
      localPoint,
    );

    // Transfer a little of the impact to connected parts so the body reacts
    // immediately instead of looking like only one rigid segment was hit.
    const kick = impulse.clone().scale(0.12);

    for (const part of ragdoll.bodies.values()) {
      if (part === body) {
        part.wakeUp();
        continue;
      }

      part.applyImpulse(
        kick,
        new CANNON.Vec3(),
      );
      part.wakeUp();
    }

    ragdoll.sleep = false;
  }

  update() {
    const now = performance.now();

    for (const ragdoll of this.active) {
      this.#syncRagdoll(ragdoll);

      if (
        (now - ragdoll.createdAt) / 1000 >=
        ragdoll.cleanupSeconds
      ) {
        this.destroy(ragdoll);
      }
    }
  }

  #syncRagdoll(ragdoll) {
    for (const body of ragdoll.bodies.values()) {
      const object = body.userData?.object;
      if (!object) continue;

      const position = threeVec(body.position);
      const quaternion = new THREE.Quaternion(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w,
      );

      setWorldTransform(
        object,
        position,
        quaternion,
      );
    }

    ragdoll.root.position.set(
      ragdoll.bodies.get('root').position.x,
      ragdoll.bodies.get('root').position.y,
      ragdoll.bodies.get('root').position.z,
    );

    ragdoll.root.quaternion.set(
      ragdoll.bodies.get('root').quaternion.x,
      ragdoll.bodies.get('root').quaternion.y,
      ragdoll.bodies.get('root').quaternion.z,
      ragdoll.bodies.get('root').quaternion.w,
    );

    ragdoll.model.updateMatrixWorld(true);

    // Shootable ragdoll hitboxes must remain on the model hierarchy.
    for (const mesh of ragdoll.meshes) {
      mesh.visible = true;
    }
  }

  destroy(ragdoll) {
    if (!this.active.has(ragdoll)) return;

    for (const constraint of ragdoll.constraints) {
      this.world.removeConstraint(constraint);
    }

    for (const body of ragdoll.bodies.values()) {
      this.world.removeBody(body);
    }

    ragdoll.constraints.length = 0;
    ragdoll.bodies.clear();

    if (ragdoll.root.parent) {
      ragdoll.root.parent.remove(ragdoll.root);
    }

    this.active.delete(ragdoll);
  }

  dispose() {
    for (const ragdoll of [...this.active]) {
      this.destroy(ragdoll);
    }
    this.active.clear();
  }
}
