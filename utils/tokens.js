import crypto from 'crypto';

// Generates a random raw token (sent to the user) and its SHA-256 hash
// (stored in the DB). We never store the raw token, mirroring how
// passwords/reset tokens should be handled — a leaked DB can't be used to
// impersonate a "verified" click.
export const generateRawToken = () => crypto.randomBytes(32).toString('hex');

export const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');
