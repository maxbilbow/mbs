export const up = { x: 0, y: -1, z: 0 }
export const down = { x: 0, y: -1, z: 0 }
export const forward = { x: 0, y: 0, z: -1 }
export const back = { x: 0, y: 0, z: 1 }
export const left = { x: -1, y: 0, z: 0 }
export const right = { x: 1, y: 0, z: 0 }

export function distance(v1, v2) {
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const dz = v2.z - v1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
export function getLocalCoordinates(entity, { x: offsetX, y: offsetY, z: offsetZ }) {
    const view = entity.getViewDirection();
    const location = entity.location;

    const newX = location.x + view.x * offsetX + view.z * offsetZ;
    const newY = location.y + offsetY;
    const newZ = location.z + view.z * offsetX - view.x * offsetZ;

    return { x: newX, y: newY, z: newZ };
}
export function add(v1, v2) {
    return { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
}
export function subtract(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
}

export function scale(v, scalar) {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}
export function dot(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}
export function cross(v1, v2) {
    return {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x
    };
}
export function normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
export function rotateAroundYAxis(v, angle) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    return {
        x: v.x * cosA - v.z * sinA,
        y: v.y,
        z: v.x * sinA + v.z * cosA
    };
}
export function addScalar(v, scalar) {
    return { x: v.x + scalar, y: v.y + scalar, z: v.z + scalar };
}
export function equals(v1, v2) {
    return v1.x == v2.x && v1.y == v2.y && v1.z == v2.z;
}
export function angleBetween(v1, v2) {
    const dotProduct = dot(v1, v2);
    const magnitudeV1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const magnitudeV2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
    const cosAngle = dotProduct / (magnitudeV1 * magnitudeV2);
    return Math.acos(cosAngle);
}
export function reflect(v, normal) {
    const dotProd = dot(v, normal);
    return {
        x: v.x - 2 * dotProd * normal.x,
        y: v.y - 2 * dotProd * normal.y,
        z: v.z - 2 * dotProd * normal.z
    };
}

