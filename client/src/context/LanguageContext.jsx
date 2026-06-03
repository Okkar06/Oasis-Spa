import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import userService from '@/services/userService';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    try {
      return localStorage.getItem('preferredLanguage') || 'en';
    } catch (e) {
      return 'en';
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user's preferred language
  const fetchUserLanguage = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const profile = await userService.getCurrentUserProfile();
      const preferredLanguage = profile?.preferredLanguage || 'en';
      setCurrentLanguage(preferredLanguage);
      try {
        localStorage.setItem('preferredLanguage', preferredLanguage);
      } catch (e) {
        // ignore localStorage errors
      }
    } catch (error) {
      console.error('Error fetching user language preference:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch on mount and when authentication changes
  useEffect(() => {
    fetchUserLanguage();
  }, [fetchUserLanguage]);

  // Update language preference
  const updateLanguage = useCallback(async (newLanguage) => {
    setCurrentLanguage(newLanguage);
    try {
      localStorage.setItem('preferredLanguage', newLanguage);
    } catch (e) {
      // ignore
    }

    if (isAuthenticated && user && user.id) {
      try {
        await userService.updateUserProfile(user.id, { preferredLanguage: newLanguage });
      } catch (error) {
        console.error('Failed to update user language on server:', error);
      }
    }
  }, [isAuthenticated, user]);

  // Refresh language from server
  const refreshLanguage = useCallback(() => {
    return fetchUserLanguage();
  }, [fetchUserLanguage]);

  const value = {
    currentLanguage,
    setLanguage: updateLanguage,
    refreshLanguage,
    isLoading
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext;
