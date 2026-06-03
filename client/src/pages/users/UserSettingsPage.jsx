import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, User, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import useAuth from '@/hooks/useAuth';
import userService from '@/services/userService';
import { useTranslateText } from '@/components/Translate';
import { useLanguage } from '@/context/LanguageContext';

const UserSettingsPage = () => {
  const { user: currentUser } = useAuth();
  const { setLanguage, refreshLanguage } = useLanguage();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    preferredLanguage: 'en'
  });

  // Translated UI text
  const { translatedText: pageTitle } = useTranslateText('User Settings');
  const { translatedText: pageDescription } = useTranslateText('Manage your account preferences and language settings');
  const { translatedText: backToDashboard } = useTranslateText('Back to Dashboard');
  const { translatedText: profileInfoTitle } = useTranslateText('Profile Information');
  const { translatedText: profileInfoDesc } = useTranslateText('Update your personal information and language preferences');
  const { translatedText: usernameLabel } = useTranslateText('Username');
  const { translatedText: emailLabel } = useTranslateText('Email');
  const { translatedText: preferredLanguageLabel } = useTranslateText('Preferred Language');
  const { translatedText: languageHelpText } = useTranslateText('This will be used to display the application interface in your preferred language');
  const { translatedText: currentSettingsLabel } = useTranslateText('Current Settings');
  const { translatedText: roleLabel } = useTranslateText('Role');
  const { translatedText: memberSinceLabel } = useTranslateText('Member since');
  const { translatedText: lastUpdatedLabel } = useTranslateText('Last updated');
  const { translatedText: saveChangesBtn } = useTranslateText('Save Changes');
  const { translatedText: savingBtn } = useTranslateText('Saving...');
  const { translatedText: cancelBtn } = useTranslateText('Cancel');

  // Available languages
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文 (Chinese)' },
    { code: 'ms', name: 'Bahasa Melayu' },
    { code: 'ja', name: '日本語 (Japanese)' },
    { code: 'ko', name: '한국어 (Korean)' },
    { code: 'fr', name: 'Français (French)' },
    { code: 'de', name: 'Deutsch (German)' },
    { code: 'es', name: 'Español (Spanish)' },
    { code: 'it', name: 'Italiano (Italian)' },
    { code: 'pt', name: 'Português (Portuguese)' },
    { code: 'ru', name: 'Русский (Russian)' },
    { code: 'ar', name: 'العربية (Arabic)' },
    { code: 'hi', name: 'हिन्दी (Hindi)' },
    { code: 'th', name: 'ไทย (Thai)' },
    { code: 'vi', name: 'Tiếng Việt (Vietnamese)' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'tl', name: 'Filipino' }
  ];

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      const profile = await userService.getCurrentUserProfile();

      setUserProfile(profile);
      setFormData({
        username: profile.username || '',
        email: profile.email || '',
        preferredLanguage: profile.preferredLanguage || 'en'
      });
    } catch (error) {
      console.error('Error loading user profile:', error);
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate form
      if (!formData.username.trim()) {
        toast.error('Username is required');
        return;
      }

      if (!formData.email.trim()) {
        toast.error('Email is required');
        return;
      }

      // Update user profile
      await userService.updateUserProfile(userProfile.id, {
        username: formData.username,
        email: formData.email,
        preferredLanguage: formData.preferredLanguage
      });

      // Update language context to trigger re-translation across the app
      setLanguage(formData.preferredLanguage);

      toast.success('Profile updated successfully');

      // Reload profile to get updated data
      await loadUserProfile();

    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {backToDashboard}
        </Button>
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {profileInfoTitle}
          </CardTitle>
          <CardDescription>
            {profileInfoDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">{usernameLabel}</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="Enter your username"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{emailLabel}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Enter your email"
            />
          </div>

          {/* Preferred Language */}
          <div className="space-y-2">
            <Label htmlFor="language">{preferredLanguageLabel}</Label>
            <Select
              value={formData.preferredLanguage}
              onValueChange={(value) => handleInputChange('preferredLanguage', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your preferred language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {languageHelpText}
            </p>
          </div>

          {/* Current Settings Info */}
          {userProfile && (
            <Alert>
              <AlertDescription>
                <strong>{currentSettingsLabel}:</strong><br />
                {roleLabel}: {userProfile.role}<br />
                {memberSinceLabel}: {userProfile.createdAt ? new Date(userProfile.createdAt).toLocaleDateString() : 'N/A'}<br />
                {lastUpdatedLabel}: {userProfile.updatedAt ? new Date(userProfile.updatedAt).toLocaleDateString() : 'N/A'}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? savingBtn : saveChangesBtn}
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate(-1)}
            >
              {cancelBtn}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserSettingsPage;