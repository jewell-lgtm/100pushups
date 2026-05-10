declare module 'react-native-keep-awake' {
  export function activateKeepAwakeAsync(tag?: string): Promise<void>;
  export function deactivateKeepAwake(tag?: string): void;
}
