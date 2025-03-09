import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  email?: string;
  displayName?: string;
  avatar_url?: string;
  created_at?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    if (data.user) {
      set({ 
        user: {
          id: data.user.id,
          email: data.user.email,
          displayName: data.user.email?.split('@')[0],
          created_at: data.user.created_at,
          avatar_url: data.user.user_metadata?.avatar_url
        }, 
        loading: false 
      });
    }
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    
    if (error) throw error;
  },

  signUp: async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      },
    });
    
    if (error) throw error;
    
    // We won't auto sign-in anymore, as email confirmation is required
    // The user will be redirected back to the site after confirming
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    set({ user: null });
  },
}));

// Initialize auth state and handle OAuth callbacks
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    useAuthStore.setState({ 
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.email?.split('@')[0],
        created_at: session.user.created_at,
        avatar_url: session.user.user_metadata?.avatar_url
      },
      loading: false 
    });
  } else {
    useAuthStore.setState({ user: null, loading: false });
  }
});

// Check for existing session on load
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    useAuthStore.setState({ 
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.email?.split('@')[0],
        created_at: session.user.created_at,
        avatar_url: session.user.user_metadata?.avatar_url
      },
      loading: false 
    });
  } else {
    useAuthStore.setState({ user: null, loading: false });
  }
});