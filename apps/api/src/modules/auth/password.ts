import { hash, verify } from '@node-rs/argon2';

const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, options);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword('cloudflow-dummy-password');
  await verifyPassword(await dummyHash, plain);
}
