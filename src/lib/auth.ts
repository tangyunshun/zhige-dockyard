import { compare, hash } from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword);
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  requirements: string[];
} {
  const requirements = [];
  let score = 0;

  if (password.length >= 8) {
    score++;
  } else {
    requirements.push('至少 8 个字符');
  }

  if (/[a-z]/.test(password)) {
    score++;
  } else {
    requirements.push('包含小写字母');
  }

  if (/[A-Z]/.test(password)) {
    score++;
  } else {
    requirements.push('包含大写字母');
  }

  if (/[0-9]/.test(password)) {
    score++;
  } else {
    requirements.push('包含数字');
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score++;
  } else {
    requirements.push('包含特殊字符');
  }

  return {
    valid: score === 5,
    score,
    requirements,
  };
}
