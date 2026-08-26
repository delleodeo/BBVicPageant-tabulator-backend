import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

export const uploadRoot = fileURLToPath(new URL('../../uploads', import.meta.url));
export const contestantUploadDir = fileURLToPath(new URL('../../uploads/contestants', import.meta.url));

mkdirSync(contestantUploadDir, { recursive: true });
