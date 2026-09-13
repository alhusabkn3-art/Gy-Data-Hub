/**

* Authentication helpers.
* 
* bcryptjs is used instead of native bcrypt so the API server
* can bundle cleanly with esbuild.
  */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPin(
pin: string,
): Promise<string> {
if (
typeof pin !== 'string' ||
pin.length === 0
) {
throw new Error(
'PIN is required.',
);
}

return bcrypt.hash(
pin,
SALT_ROUNDS,
);
}

export async function verifyPin(
plain: string,
hash: string,
): Promise<boolean> {
if (
typeof plain !== 'string' ||
typeof hash !== 'string' ||
plain.length === 0 ||
hash.length === 0
) {
return false;
}

try {
return await bcrypt.compare(
plain,
hash,
);
} catch (error) {
console.error(
'PIN verification failed:',
error,
);

return false;

}
}
