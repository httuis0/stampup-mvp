// ============================================================
// Screen 1: Login / Sign Up
// Designed with large inputs and buttons for busy shop owners.
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

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Validate form inputs before sending to Supabase
  const validateInputs = (): boolean => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErrorMessage(strings.auth.invalidEmail);
      return false;
    }

    if (!password || password.length < 6) {
      setErrorMessage(strings.auth.passwordTooShort);
      return false;
    }

    return true;
  };

  // Convert technical Supabase error strings into plain, friendly English
  const handleAuthError = (err: any) => {
    const raw = (err?.message || '').toLowerCase();

    if (raw.includes('network') || raw.includes('failed to fetch') || raw.includes('fetch')) {
      setErrorMessage(strings.common.networkError);
    } else if (raw.includes('email not confirmed')) {
      setErrorMessage('Your email is not confirmed yet. Please check your inbox or disable "Confirm email" in Supabase.');
    } else if (raw.includes('invalid login credentials') || raw.includes('invalid credentials')) {
      setErrorMessage('Incorrect email/password, or your email has not been confirmed yet.');
    } else if (raw.includes('already registered') || raw.includes('user already exists')) {
      setErrorMessage(strings.auth.emailAlreadyUsed);
    } else {
      setErrorMessage(err?.message || strings.common.error);
    }
  };

  // Handle Log In submission
  const handleLogin = async () => {
    if (!validateInputs()) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        handleAuthError(error);
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

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        handleAuthError(error);
      } else if (data.session) {
        // Automatically signed in (email confirmation disabled in Supabase)
        if (onSuccess) onSuccess();
      } else {
        // Email confirmation required by Supabase project settings
        setSuccessMessage(strings.auth.accountCreatedSuccess);
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
          <Text style={styles.logo}>{strings.common.appName}</Text>
          <Text style={styles.subtitle}>
            {isLogin ? strings.auth.loginSubtitle : strings.auth.signupSubtitle}
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
            }}
            disabled={loading}
          >
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
              {strings.auth.loginButton}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, !isLogin && styles.tabButtonActive]}
            onPress={() => {
              setIsLogin(false);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            disabled={loading}
          >
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
              {strings.auth.signupButton}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Container */}
        <View style={styles.form}>
          {/* Error Message Box */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Success Message Box */}
          {successMessage && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          )}

          {/* Email Input */}
          <Text style={styles.inputLabel}>{strings.auth.emailLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={strings.auth.emailPlaceholder}
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!loading}
          />

          {/* Password Input */}
          <Text style={styles.inputLabel}>{strings.auth.passwordLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={strings.auth.passwordPlaceholder}
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
          />

          {/* Big Action Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={isLogin ? handleLogin : handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLogin ? strings.auth.loginButton : strings.auth.signupButton}
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
            }}
            disabled={loading}
          >
            <Text style={styles.switchButtonText}>
              {isLogin ? strings.auth.switchToSignup : strings.auth.switchToLogin}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1E3A8A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
    marginTop: 8,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#1E3A8A',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '500',
  },
  successBox: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#065F46',
    fontSize: 14,
    fontWeight: '500',
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#111827',
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  switchButton: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchButtonText: {
    fontSize: 15,
    color: '#2563EB',
    fontWeight: '600',
  },
});
