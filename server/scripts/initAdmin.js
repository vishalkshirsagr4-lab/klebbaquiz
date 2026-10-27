/**
 * DEPRECATED: Insecure hardcoded administrator initialization has been removed.
 *
 * For security reasons, QuizMaster does not support hardcoded credentials in scripts.
 * Please use the secure administrator setup CLI:
 *   npm run setup-admin
 * or
 *   npm run create-admin
 */
console.warn('\n[Notice] initAdmin.js with hardcoded passwords has been disabled for security.');
console.warn('Redirecting to the secure administrator creation script...\n');

require('./createAdmin');
