import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Trash2, Save, Info, Pencil, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/services/api';
import translationService from '@/services/translationService';
import { useLanguage } from '@/context/LanguageContext';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

const CustomTranslationsPage = () => {
  const { currentLanguage } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [translations, setTranslations] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const validLanguages = ['zh', 'ms', 'ja', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'hi', 'th', 'vi', 'id', 'tl'];
    const currentLang = currentLanguage || 'en';
    return validLanguages.includes(currentLang) ? currentLang : 'zh';
  });
  const [editingId, setEditingId] = useState(null);
  const [editedSourceText, setEditedSourceText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [newTranslation, setNewTranslation] = useState({
    sourceText: '',
    translatedText: '',
    targetLanguage: 'zh',
    sourceLanguage: 'en'
  });

  const languages = [
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
    if (currentLanguage && currentLanguage !== 'en') {
      setSelectedLanguage(currentLanguage);
    }
  }, [currentLanguage]);

  useEffect(() => {
    loadTranslations();
  }, [selectedLanguage]);

  const loadTranslations = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/translations/custom', {
        params: {
          targetLanguage: selectedLanguage,
          sourceLanguage: 'en'
        }
      });
      setTranslations(response.data.data.translations);
    } catch (error) {
      console.error('Error loading custom translations:', error);
      if (error.response?.status === 503) {
        toast.error('Database temporarily unavailable due to quota limits. Please try again later.');
      } else {
        toast.error('Failed to load custom translations');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!newTranslation.sourceText || !newTranslation.translatedText) {
      toast.error('Please fill in both source text and translation');
      return;
    }

    try {
      await apiClient.post('/translations/custom', {
        sourceText: newTranslation.sourceText,
        translatedText: newTranslation.translatedText,
        targetLanguage: selectedLanguage,
        sourceLanguage: 'en'
      });

      // Clear cache for this text so the custom translation is used
      translationService.clearCacheForText(newTranslation.sourceText, selectedLanguage, 'en');

      toast.success('Custom translation saved successfully');
      setNewTranslation({
        sourceText: '',
        translatedText: '',
        targetLanguage: selectedLanguage,
        sourceLanguage: 'en'
      });
      loadTranslations();
    } catch (error) {
      console.error('Error saving custom translation:', error);
      toast.error('Failed to save custom translation');
    }
  };

  const handleDelete = async (id) => {
    try {
      // Find the translation to get its text before deleting
      const translationToDelete = translations.find(t => t.id === id);
      
      await apiClient.delete(`/translations/custom/${id}`);
      
      // Clear cache for this text so Google Translate is used again
      if (translationToDelete) {
        translationService.clearCacheForText(
          translationToDelete.sourceText, 
          translationToDelete.targetLanguage, 
          translationToDelete.sourceLanguage
        );
      }
      
      toast.success('Custom translation deleted successfully');
      loadTranslations();
    } catch (error) {
      console.error('Error deleting custom translation:', error);
      toast.error('Failed to delete custom translation');
    }
  };

  const handleEdit = (translation) => {
    setEditingId(translation.id);
    setEditedSourceText(translation.sourceText);
    setEditedText(translation.translatedText);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditedSourceText('');
    setEditedText('');
  };

  const handleSaveEdit = async (translation) => {
    if (!editedSourceText.trim() || !editedText.trim()) {
      toast.error('Both source text and translation cannot be empty');
      return;
    }

    try {
      // If source text changed, delete the old translation first
      if (editedSourceText !== translation.sourceText) {
        await apiClient.delete(`/translations/custom/${translation.id}`);
        
        // Clear cache for old text
        translationService.clearCacheForText(
          translation.sourceText,
          translation.targetLanguage,
          translation.sourceLanguage
        );
      }

      // Create or update translation with new values
      await apiClient.post('/translations/custom', {
        sourceText: editedSourceText,
        translatedText: editedText,
        targetLanguage: translation.targetLanguage,
        sourceLanguage: translation.sourceLanguage
      });

      // Clear cache for new text
      translationService.clearCacheForText(
        editedSourceText,
        translation.targetLanguage,
        translation.sourceLanguage
      );

      toast.success('Custom translation updated successfully');
      setEditingId(null);
      setEditedSourceText('');
      setEditedText('');
      loadTranslations();
    } catch (error) {
      console.error('Error updating custom translation:', error);
      toast.error('Failed to update custom translation');
    }
  };

  return (
    <div className='[--header-height:calc(theme(spacing.14))]'>
      <SidebarProvider className='flex flex-col'>
        <SiteHeader />
        <div className='flex flex-1'>
          <AppSidebar />
          <SidebarInset>
            <div className='container mx-auto p-4 space-y-6'>
              <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Custom Translation Overrides</CardTitle>
              <CardDescription>
                Override Google Translate with your own accurate translations for specific words or phrases.
                Personal custom translations take priority over global translations and automatic translations.
                <br />
                <strong>Translation Priority:</strong> Personal Custom → Global Custom → Google Translate
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              onClick={() => {
                translationService.clearCache();
                toast.success('Translation cache cleared. Page will reload.');
                setTimeout(() => window.location.reload(), 1000);
              }}
            >
              Clear Cache
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language Info Alert */}
          {currentLanguage === 'en' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Your current language is English. Custom translations only apply when using a non-English language.
                Switch to another language in Settings to see custom translations in action.
              </AlertDescription>
            </Alert>
          )}
          {currentLanguage !== 'en' && currentLanguage !== selectedLanguage && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You're viewing {languages.find(l => l.code === selectedLanguage)?.name} translations,
                but your current language is {languages.find(l => l.code === currentLanguage)?.name}.
                Custom translations for {languages.find(l => l.code === selectedLanguage)?.name} won't apply until you switch to that language.
              </AlertDescription>
            </Alert>
          )}
          {currentLanguage !== 'en' && currentLanguage === selectedLanguage && (
            <Alert className="bg-green-50 border-green-200">
              <Info className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900">
                ✓ Custom translations for {languages.find(l => l.code === currentLanguage)?.name} are currently active.
                Any translations you add here will immediately override Google Translate.
              </AlertDescription>
            </Alert>
          )}

          {/* Language Selector */}
          <div className="space-y-2">
            <Label>Target Language</Label>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add New Translation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Custom Translation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>English Text</Label>
                  <Input
                    data-no-translate
                    value={newTranslation.sourceText}
                    onChange={(e) => setNewTranslation({ ...newTranslation, sourceText: e.target.value })}
                    placeholder="Enter English text"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Translation ({languages.find(l => l.code === selectedLanguage)?.name})</Label>
                  <Input
                    value={newTranslation.translatedText}
                    onChange={(e) => setNewTranslation({ ...newTranslation, translatedText: e.target.value })}
                    placeholder="Enter translation"
                  />
                </div>
              </div>
              <Button onClick={handleSave} className="mt-4">
                <Save className="h-4 w-4 mr-2" />
                Save Translation
              </Button>
            </CardContent>
          </Card>

          {/* Existing Translations Table */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              Existing Custom Translations ({translations.length})
            </h3>
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : translations.length === 0 ? (
              <p className="text-muted-foreground text-center p-8">
                No custom translations for this language yet
              </p>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead data-no-translate>English Text</TableHead>
                      <TableHead>Translation</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {translations.map((trans) => (
                      <TableRow key={trans.id.toString()}>
                        <TableCell className="font-medium" data-no-translate>
                          {editingId === trans.id ? (
                            <Input
                              value={editedSourceText}
                              onChange={(e) => setEditedSourceText(e.target.value)}
                              className="h-8"
                              data-no-translate
                            />
                          ) : (
                            trans.sourceText
                          )}
                        </TableCell>
                        <TableCell data-no-translate>
                          {editingId === trans.id ? (
                            <Input
                              value={editedText}
                              onChange={(e) => setEditedText(e.target.value)}
                              className="h-8"
                              data-no-translate
                            />
                          ) : (
                            trans.translatedText
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {editingId === trans.id ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSaveEdit(trans)}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleCancelEdit}
                                  aria-label="Cancel editing"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(trans)}
                                  aria-label="Edit translation"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(trans.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default CustomTranslationsPage;
