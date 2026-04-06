import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export interface AuthState {
  backendUrl: string | null;
  token: string | null;
  nickname: string;
  isAuthorized: boolean;
}

export const AuthContext = createContext<AuthState>({
  backendUrl: null,
  token: null,
  nickname: 'My Browser',
  isAuthorized: false,
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
