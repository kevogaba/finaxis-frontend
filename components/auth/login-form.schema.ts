import { z } from 'zod';

/**
 * `identifier` accepts either an email or a username. It is only checked against
 * email formatting when it looks like one (contains "@"), so plain usernames stay valid.
 */
export const loginFormSchema = z
  .object({
    identifier: z.string().trim().min(1, 'Enter your email or username.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    rememberMe: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.identifier.includes('@') && !z.email().safeParse(data.identifier).success) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid email address.',
        path: ['identifier'],
      });
    }
  });

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const loginFormDefaultValues: LoginFormValues = {
  identifier: '',
  password: '',
  rememberMe: false,
};
