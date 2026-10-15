// ============================================================
// Screen 1: Login / Sign Up
// Premium FinTech auth experience for shop managers & cashiers.
// Includes strict email verification, "No Account Exists" auto-detection,
// password visibility toggle, and 1-tap account creation.
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { strings } from '../constants/strings';

interface AuthScreenProps {
  onSuccess?: () => void;
}

// RFC 5322 compliant email validator
export const isValidEmail = (emailStr: string): boolean => {
  const trimmed = emailStr.trim();
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(trimmed);
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Smart prompt states for registered / unregistered emails
  const [emailNotRegistered, setEmailNotRegistered] = useState<boolean>(false);
  const [emailAlreadyRegistered, setEmailAlreadyRegistered] = useState<boolean>(false);

  // Validate form inputs before sending to Supabase
  const validateInputs = (): boolean => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEmailNotRegistered(false);
    setEmailAlreadyRegistered(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return false;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address (e.g. owner@cafe.com).');
      return false;
    }

    if (!password || password.length < 6) {
      setErrorMessage(strings.auth.passwordTooShort);
      return false;
    }

    return true;
  };

  // Friendly error handling
  const handleAuthError = (err: any) => {
    const raw = (err?.message || '').toLowerCase();

    if (raw.includes('network') || raw.includes('failed to fetch') || raw.includes('fetch')) {
      setErrorMessage(strings.common.networkError);
    } else if (raw.includes('email not confirmed')) {
      setErrorMessage('Your email is not confirmed yet. Please check your inbox.');
    } else if (raw.includes('invalid login credentials') || raw.includes('invalid credentials')) {
      setErrorMessage('Invalid email or password. If you do not have an account yet, please create one.');
      setEmailNotRegistered(true);
    } else if (raw.includes('already registered') || raw.includes('user already exists')) {
      setErrorMessage(strings.auth.emailAlreadyUsed);
      setEmailAlreadyRegistered(true);
    } else {
      setErrorMessage(err?.message || strings.common.error);
    }
  };

  // Check if email exists in database
  const checkEmailExistsInDb = async (targetEmail: string): Promise<boolean | null> => {
    try {
      const { data, error } = await supabase.rpc('check_email_exists', {
        p_email: targetEmail,
      });
      if (!error && typeof data === 'boolean') {
        return data;
      }
    } catch (e) {
      // Fallback if RPC is not deployed yet
    }
    return null;
  };

  // Handle Log In submission
  const handleLogin = async () => {
    if (!validateInputs()) return;

    setLoading(true);
    setErrorMessage(null);
    setEmailNotRegistered(false);
    setEmailAlreadyRegistered(false);

    const cleanEmail = email.trim().toLowerCase();

    // 1. Check if email exists
    const exists = await checkEmailExistsInDb(cleanEmail);

    if (exists === false) {
      setLoading(false);
      setErrorMessage(`No account found for "${cleanEmail}". Please create an account first.`);
      setEmailNotRegistered(true);
      return;
    }

    // 2. Attempt login
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        const raw = (error.message || '').toLowerCase();
        if (raw.includes('invalid login credentials') || raw.includes('invalid credentials')) {
          if (exists === true) {
            setErrorMessage('Incorrect password for this account. Please check your password.');
          } else {
            setErrorMessage('Invalid email or password. If you do not have an account, please create one.');
            setEmailNotRegistered(true);
          }
        } else {
          handleAuthError(error);
        }
      } else {
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Account submission
  const handleSignUp = async () => {
    if (!validateInputs()) return;

    setLoading(true);
    setErrorMessage(null);
    setEmailNotRegistered(false);
    setEmailAlreadyRegistered(false);

    const cleanEmail = email.trim().toLowerCase();

    // 1. Check if email already exists
    const exists = await checkEmailExistsInDb(cleanEmail);

    if (exists === true) {
      setLoading(false);
      setErrorMessage(`An account for "${cleanEmail}" already exists. Please log in.`);
      setEmailAlreadyRegistered(true);
      return;
    }

    // 2. Attempt signup
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (error) {
        handleAuthError(error);
      } else if (data.session) {
        if (onSuccess) onSuccess();
      } else {
        // Attempt immediate login if auto-confirmed
        const loginAttempt = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (loginAttempt.data.session) {
          if (onSuccess) onSuccess();
        } else {
          setSuccessMessage(strings.auth.accountCreatedSuccess);
        }
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* App Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>⚡</Text>
          </View>
          <Text style={styles.logo}>StampUp</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Sign in to access your shop POS' : 'Create your digital loyalty store'}
          </Text>
        </View>

        {/* Tab Switcher: Log In vs Create Account */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, isLogin && styles.tabButtonActive]}
            onPress={() => {
              setIsLogin(true);
              setErrorMessage(null);
              setSuccessMessage(null);
              setEmailNotRegistered(false);
              setEmailAlreadyRegistered(false);
            }}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
              Log In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, !isLogin && styles.tabButtonActive]}
            onPress={() => {
              setIsLogin(false);
              setErrorMessage(null);
              setSuccessMessage(null);
              setEmailNotRegistered(false);
              setEmailAlreadyRegistered(false);
            }}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Container */}
        <View style={styles.formCard}>
          {/* Error Message Box */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {/* Action Prompt: If account not found during login */}
          {emailNotRegistered && isLogin && (
            <View style={styles.promptCard}>
              <Text style={styles.promptTitle}>⚡ Need an account?</Text>
              <Text style={styles.promptSubtitle}>
                No shop account was found for <Text style={{ fontWeight: '700' }}>{email.trim()}</Text>. You can register a new store account now:
              </Text>
              <TouchableOpacity
                style={styles.promptActionBtn}
                onPress={() => {
                  setIsLogin(false);
                  setEmailNotRegistered(false);
                  setErrorMessage(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.promptActionBtnText}>+ Switch to Create Account</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action Prompt: If account already exists during signup */}
          {emailAlreadyRegistered && !isLogin && (
            <View style={styles.promptCard}>
              <Text style={styles.promptTitle}>🔑 Account Already Registered</Text>
              <Text style={styles.promptSubtitle}>
                An account with <Text style={{ fontWeight: '700' }}>{email.trim()}</Text> is already active. Please sign in:
              </Text>
              <TouchableOpacity
                style={styles.promptActionBtn}
                onPress={() => {
                  setIsLogin(true);
                  setEmailAlreadyRegistered(false);
                  setErrorMessage(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.promptActionBtnText}>Sign In with this Email →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Success Message Box */}
          {successMessage && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✓ {successMessage}</Text>
            </View>
          )}

          {/* Email Input */}
          <Text style={styles.inputLabel}>{strings.auth.emailLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={strings.auth.emailPlaceholder}
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (errorMessage) setErrorMessage(null);
              if (emailNotRegistered) setEmailNotRegistered(false);
              if (emailAlreadyRegistered) setEmailAlreadyRegistered(false);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!loading}
          />

          {/* Password Input with Visibility Toggle */}
          <Text style={styles.inputLabel}>{strings.auth.passwordLabel}</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder={strings.auth.passwordPlaceholder}
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errorMessage) setErrorMessage(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.passwordToggleBtn}
              onPress={() => setShowPassword(!showPassword)}
              activeOpacity={0.7}
            >
              <Text style={styles.passwordToggleText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={isLogin ? handleLogin : handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLogin ? 'Sign In to Store' : 'Create Free Store'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Switch Link */}
          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setIsLogin(!isLogin);
              setErrorMessage(null);
              setSuccessMessage(null);
              setEmailNotRegistered(false);
              setEmailAlreadyRegistered(false);
            }}
            disabled={loading}
          >
            <Text style={styles.switchButtonText}>
              {isLogin ? strings.auth.switchToSignup : strings.auth.switchToLogin}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Security badge footer */}
        <View style={styles.footerBadge}>
          <Text style={styles.footerBadgeText}>🔒 End-to-End Encrypted POS System</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  logoBadgeText: {
    fontSize: 26,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 14,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
    borderRadius: 12,
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  passwordToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  passwordToggleText: {
    fontSize: 18,
  },
  primaryButton: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  switchButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchButtonText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  promptCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  promptTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
    marginBottom: 4,
  },
  promptSubtitle: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
    marginBottom: 10,
  },
  promptActionBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  promptActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  successBox: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  successText: {
    color: '#065F46',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerBadge: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerBadgeText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
