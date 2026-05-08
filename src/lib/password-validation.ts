export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 12) {
    return { valid: false, error: 'A senha deve ter pelo menos 12 caracteres' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'A senha deve conter letras minúsculas' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'A senha deve conter letras maiúsculas' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'A senha deve conter números' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: 'A senha deve conter caracteres especiais' };
  }
  return { valid: true };
}
