import { z } from 'zod';

export const BufferSchema = z.object({
    type: z.literal('Buffer'),
    data: z.array(z.number()) // or z.string() if it's a base64 string
});