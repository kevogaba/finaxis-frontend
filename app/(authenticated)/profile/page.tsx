import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/auth/auth';
import { getSelectedContextProfile, profileToFinaxisUser } from '@/auth/context-service';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import { ProfileView } from '@/components/profile/profile-view';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const headersList = await headers();
  const [sessionUser, session, selectedContext] = await Promise.all([
    getAuthenticatedUser(headersList),
    auth.api.getSession({ headers: headersList }),
    getSelectedContextProfile(headersList),
  ]);

  // (authenticated)/layout.tsx already redirects when there is no session;
  // this defensive re-check follows Next's guidance to verify auth in every
  // Server Component that renders sensitive data, not just in the layout.
  if (!sessionUser || !session) {
    redirect('/login?reason=session_expired');
  }

  if (selectedContext.kind !== 'resolved') {
    redirect('/select-context');
  }

  return (
    <ProfileView
      user={profileToFinaxisUser(selectedContext.profile, sessionUser)}
      signedInAt={session.session.createdAt}
    />
  );
}
