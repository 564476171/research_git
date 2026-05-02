'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth';

export function useGuestGuard() {
  const router = useRouter();
  const { isAuthed, loading } = useAuth();
  useEffect(() => {
    if (!loading && isAuthed) router.push('/');
  }, [isAuthed, loading, router]);
  return { isAuthed, loading };
}
