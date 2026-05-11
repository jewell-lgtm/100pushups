// Repo-root manual mock for `posthog-react-native`. The real SDK pulls
// the entire `react-native` runtime via `import` (ES module syntax) which
// jest's node test environment can't parse. Tests that need to assert on
// SDK behaviour use a per-file `jest.mock(...)` override; everything else
// falls through to this benign stub so importing the analytics module is
// free.
class PostHog {
  identify(): void {}
  capture(): void {}
}

export default PostHog;
export { PostHog };
