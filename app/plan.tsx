import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// Phase 13.5: the Plan screen has been folded into Stats (Phase
// 11.3). This redirect catches any stale link or back-gesture hop
// until the route is deleted in a follow-up release.
export default function PlanRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
