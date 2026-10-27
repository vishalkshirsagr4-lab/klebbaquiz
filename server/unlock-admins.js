/**
 * DEPRECATED: Hardcoded password reset has been removed.
 *
 * For security reasons, QuizMaster does not support hardcoded credentials in scripts.
 * Please use the secure administrator recovery CLI:
 *   npm run reset-admin-password
 */
console.warn('\n[Notice] unlock-admins.js with hardcoded passwords has been disabled for security.');
console.warn('Redirecting to the secure administrator password recovery script...\n');

require('./scripts/resetAdminPassword');
