// lib/services/AuthService.ts
import { BaseService } from './BaseService';
import type { User, UserProfile, Organization } from '../types';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { IndexedDBStorage } from "../storage/IndexedDB";

const LICENSE_KEY_STORAGE_KEY = 'stored_license_key';

export class AuthService extends BaseService {
    protected storageKey: string = 'auth';

    constructor(
        private supabase: SupabaseClient,
        storage: IndexedDBStorage
    ) {
        super(storage);
    }

    async getSession(): Promise<Session | null> {
        try {
            const { data: { session }, error } = await this.supabase.auth.getSession();

            if (error || !session) {
                console.error('Session fetch error:', error);

                // Attempt to retrieve session from local storage
                const localSession = await this.storage.getSession();
                if (localSession) {
                    return localSession;
                }

                return null;
            }

            // Update local session
            await this.storage.saveSession(session);

            return session;
        } catch (error) {
            console.error('GetSession error:', error);

            // Attempt to retrieve session from local storage
            const localSession = await this.storage.getSession();
            if (localSession) {
                return localSession;
            }

            return null;
        }
    }

    async getCurrentUser(): Promise<User | null> {
        try {
            const { data: { user }, error } = await this.supabase.auth.getUser();

            if (error || !user) {
                // Attempt to retrieve user from local storage
                const localUser = await this.storage.getUser();
                if (localUser) {
                    return localUser;
                }
                return null;
            }

            const currentUser: User = {
                id: user.id,
                email: user.email || '',
                last_sign_in_at: user?.last_sign_in_at || null
            };

            // Update local user data
            await this.storage.saveUser(currentUser);

            return currentUser;
        } catch (error) {
            console.error('GetUser error:', error);

            // Attempt to retrieve user from local storage
            const localUser = await this.storage.getUser();
            if (localUser) {
                return localUser;
            }

            return null;
        }
    }

    // Get session from local storage
    async getLocalSession(): Promise<Session | null> {
        try {
            const session = await this.storage.getSession();
            if (session && session.expires_at) {
                // Check if session is still valid
                if (new Date(session.expires_at * 1000) > new Date()) {
                    return session;
                } else {
                    // Session expired, remove from storage
                    await this.storage.removeSession();
                    return null;
                }
            }
            return null;
        } catch (error) {
            console.error('Error retrieving local session:', error);
            return null;
        }
    }

    // Get user from local storage
    async getLocalUser(): Promise<User | null> {
        try {
            const user = await this.storage.getUser();
            return user || null;
        } catch (error) {
            console.error('Error retrieving local user:', error);
            return null;
        }
    }

// lib/services/AuthService.ts

    async signIn(email: string, password: string): Promise<{
        user: User;
        profile: UserProfile;
        organization: Organization | undefined;
        storedLicenseKey: string | null;
    }> {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            if (!data.user || !data.session) throw new Error('No user or session returned from sign in');

            const user: User = {
                id: data.user.id,
                email: data.user.email || '',
                last_sign_in_at: data.user.last_sign_in_at || null
            };

            // **Add these lines to store session and user data locally**
            await this.storage.saveSession(data.session);
            await this.storage.saveUser(user);

            const profile = await this.getUserProfile(user.id);
            let organization: Organization | undefined;

            if (profile.organization_id) {
                organization = await this.getOrganization(profile.organization_id);
            }

            // Store profile and organization locally
            await this.storage.saveUserProfile(profile);
            if (organization) {
                await this.storage.saveOrganization(organization);
            }

            const storedLicenseKey = localStorage.getItem(LICENSE_KEY_STORAGE_KEY);

            return { user, profile, organization, storedLicenseKey };
        } catch (error) {
            console.error('SignIn error:', error);
            throw error;
        }
    }


    async signUp(email: string, password: string, licenseKey: string): Promise<void> {
        try {
            // First verify the license key
            const { data: licenseData, error: licenseError } = await this.supabase
                .from('license_keys')
                .select('*')
                .eq('key', licenseKey)
                .single();

            if (licenseError || !licenseData) {
                throw new Error('Invalid license key');
            }

            if (!licenseData.is_active) {
                throw new Error('License key is inactive');
            }

            // Store license key for post-signup processing
            localStorage.setItem(LICENSE_KEY_STORAGE_KEY, licenseKey);

            // Sign up the user
            const { error: signUpError } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        license_key: licenseKey
                    }
                }
            });

            if (signUpError) throw signUpError;
        } catch (error) {
            console.error('SignUp error:', error);
            throw error;
        }
    }

    async resetPassword(email: string): Promise<void> {
        try {
            const { error } = await this.supabase.auth.resetPasswordForEmail(email);
            if (error) throw error;
        } catch (error) {
            console.error('Reset password error:', error);
            throw error;
        }
    }

    async processLicenseKey(licenseKey: string): Promise<void> {
        try {
            const { data: licenseData, error: licenseError } = await this.supabase
                .from('license_keys')
                .select('*')
                .eq('key', licenseKey)
                .single();

            if (licenseError || !licenseData) {
                throw new Error('Invalid license key');
            }

            // Clear the stored license key after processing
            localStorage.removeItem(LICENSE_KEY_STORAGE_KEY);
        } catch (error) {
            console.error('Process license key error:', error);
            throw error;
        }
    }

    async getUserProfile(userId: string): Promise<UserProfile> {
        try {
            // Try local first
            const localProfile = await this.storage.getUserProfile(userId);
            if (localProfile) return localProfile;

            // Fetch from remote
            const { data, error } = await this.supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            if (!data) throw new Error('User profile not found');

            // Save to local storage
            await this.storage.saveUserProfile(data);
            return data;
        } catch (error) {
            console.error('GetUserProfile error:', error);
            throw error;
        }
    }

    async getOrganization(orgId: string): Promise<Organization> {
        try {
            // Try local first
            const localOrg = await this.storage.getOrganization(orgId);
            if (localOrg) return localOrg;

            // Fetch from remote
            const { data, error } = await this.supabase
                .from('organizations')
                .select('*')
                .eq('id', orgId)
                .single();

            if (error) throw error;
            if (!data) throw new Error('Organization not found');

            // Save to local storage
            await this.storage.saveOrganization(data);
            return data;
        } catch (error) {
            console.error('GetOrganization error:', error);
            throw error;
        }
    }

    async signOut(): Promise<void> {
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;

            // Clear local storage
            await this.storage.clearStore('user_profiles');
            await this.storage.clearStore('organizations');
            await this.storage.removeSession();
            await this.storage.removeUser();
            localStorage.removeItem(LICENSE_KEY_STORAGE_KEY);
        } catch (error) {
            console.error('SignOut error:', error);
            throw error;
        }
    }
}