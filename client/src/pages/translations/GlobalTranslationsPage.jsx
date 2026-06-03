import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Save, Info, Pencil, X, Check, Shield, BarChart3, TrendingUp, Users, Globe } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/services/api';
import translationService from '@/services/translationService';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';

const GlobalTranslationsPage = () => {
  const [loading, setLoading] = useState(false);
  const [translations, setTranslations] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('zh');
  const [editingId, setEditingId] = useState(null);
  const [editedSourceText, setEditedSourceText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [newTranslation, setNewTranslation] = useState({
    sourceText: '',
    translatedText: '',
    targetLanguage: 'zh',
    sourceLanguage: 'en'
  });

  // Analytics state
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [usageStats, setUsageStats] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
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
    loadTranslations();
    loadAnalytics();
  }, [selectedLanguage]);

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const response = await apiClient.get('/translations/usage/stats', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          limit: 1000
        }
      });
      setUsageStats(response.data.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load usage analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadTranslations = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/translations/custom/global', {
        params: {
          targetLanguage: selectedLanguage,
          sourceLanguage: 'en'
        }
      });
      setTranslations(response.data.data.translations);
    } catch (error) {
      console.error('Error loading global custom translations:', error);
      toast.error('Failed to load global custom translations');
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
      await apiClient.post('/translations/custom/global', {
        sourceText: newTranslation.sourceText,
        translatedText: newTranslation.translatedText,
        targetLanguage: selectedLanguage,
        sourceLanguage: 'en'
      });

      // Clear entire cache to force immediate update for all users
      translationService.clearCache();

      toast.success('Global custom translation saved successfully. Cache cleared for all users.');
      setNewTranslation({
        sourceText: '',
        translatedText: '',
        targetLanguage: selectedLanguage,
        sourceLanguage: 'en'
      });
      await loadTranslations();
      // Refresh analytics so recent activity includes this admin action
      await loadAnalytics();
    } catch (error) {
      console.error('Error saving global custom translation:', error);
      toast.error('Failed to save global custom translation');
    }
  };

  const handleDelete = async (id) => {
    try {
      // Find the translation to get its text before deleting
      const translationToDelete = translations.find(t => t.id === id);

      await apiClient.delete(`/translations/custom/global/${id}`);

      // Clear entire cache to force immediate update for all users
      translationService.clearCache();

      toast.success('Global custom translation deleted successfully. Cache cleared for all users.');
      await loadTranslations();
      // Refresh analytics to reflect deletion
      await loadAnalytics();
    } catch (error) {
      console.error('Error deleting global custom translation:', error);
      toast.error('Failed to delete global custom translation');
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
      await apiClient.put(`/translations/custom/global/${translation.id}`, {
        sourceText: editedSourceText,
        translatedText: editedText,
      });

      // Clear cache for both old and new text
      translationService.clearCacheForText(
        translation.sourceText,
        translation.targetLanguage,
        translation.sourceLanguage
      );
      if (editedSourceText !== translation.sourceText) {
        translationService.clearCacheForText(
          editedSourceText,
          translation.targetLanguage,
          translation.sourceLanguage
        );
      }

      // Clear entire cache to force immediate update for all users
      translationService.clearCache();
      
      toast.success('Global custom translation updated successfully. Cache cleared for all users.');
      setEditingId(null);
      setEditedSourceText('');
      setEditedText('');
      await loadTranslations();
      // Refresh analytics so the update is visible in recent activity
      await loadAnalytics();
    } catch (error) {
      console.error('Error updating global custom translation:', error);
      toast.error('Failed to update global custom translation');
    }
  };

  return (
    <div className='[--header-height:calc(theme(spacing.14))]'>
      <SidebarProvider className='flex flex-col'>
        <SiteHeader />
        <div className='flex flex-1'>
          <AppSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col p-6 bg-gray-50/50 min-h-screen">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                      <Shield className="h-8 w-8 text-red-500" />
                      Translation Management
                    </h1>
                    <p className="text-muted-foreground mt-1">
                      Manage global translations and monitor usage across the platform
                    </p>
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
              </div>

              <Tabs defaultValue="management" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
                  <TabsTrigger value="management">Translation Management</TabsTrigger>
                  <TabsTrigger value="analytics">Usage Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="management" className="space-y-6 mt-0">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Translation Priority: Personal Custom Translation → Global Custom Translation → Google Translate API
                    </AlertDescription>
                  </Alert>

                  <Card>
                    <CardHeader>
                      <CardTitle>Target Language</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                        <SelectTrigger>
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
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add Global Custom Translation
                      </CardTitle>
                      <CardDescription>
                        Create a new global translation override for all users
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <Label htmlFor="source-text">Source Text (English)</Label>
                        <Input
                          id="source-text"
                          data-no-translate
                          placeholder="Enter English text"
                          value={newTranslation.sourceText}
                          onChange={(e) => setNewTranslation(prev => ({ ...prev, sourceText: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="translated-text">Translated Text ({languages.find(l => l.code === selectedLanguage)?.name})</Label>
                        <Input
                          id="translated-text"
                          placeholder={`Enter translation in ${languages.find(l => l.code === selectedLanguage)?.name}`}
                          value={newTranslation.translatedText}
                          onChange={(e) => setNewTranslation(prev => ({ ...prev, translatedText: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button onClick={handleSave} className="w-full md:w-auto">
                      <Save className="h-4 w-4 mr-2" />
                      Save Global Translation
                    </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Existing Global Translations</CardTitle>
                      <CardDescription>
                        {translations.length} translation{translations.length !== 1 ? 's' : ''} for {languages.find(l => l.code === selectedLanguage)?.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : translations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No global custom translations found for {languages.find(l => l.code === selectedLanguage)?.name}
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead data-no-translate>Source Text</TableHead>
                              <TableHead>Translation</TableHead>
                              <TableHead>Created By</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {translations.map((translation) => (
                              <TableRow key={translation.id}>
                                <TableCell data-no-translate>
                                  {editingId === translation.id ? (
                                    <Input
                                      value={editedSourceText}
                                      onChange={(e) => setEditedSourceText(e.target.value)}
                                      data-no-translate
                                      className="min-w-[200px]"
                                    />
                                  ) : (
                                    <span className="font-medium" data-no-translate>{translation.sourceText}</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingId === translation.id ? (
                                    <Input
                                      value={editedText}
                                      onChange={(e) => setEditedText(e.target.value)}
                                      className="min-w-[200px]"
                                    />
                                  ) : (
                                    <span>{translation.translatedText}</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-muted-foreground">
                                    {translation.creator?.username || 'Unknown'}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {editingId === translation.id ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleSaveEdit(translation)}
                                          aria-label="Save changes"
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={handleCancelEdit}
                                          aria-label="Cancel editing"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleEdit(translation)}
                                          aria-label="Edit translation"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          onClick={() => handleDelete(translation.id)}
                                        >
                                          <Trash2 className="h-4 w-4" />
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
                    </CardContent>
                  </Card>
                    </TabsContent>

                    <TabsContent value="analytics" className="space-y-6 mt-0">
                      {/* Analytics Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-semibold">Translation Usage Analytics</h2>
                          <p className="text-muted-foreground mt-1">Monitor translation adoption and usage patterns</p>
                        </div>
                        <Button variant="outline" onClick={loadAnalytics} disabled={analyticsLoading}>
                          {analyticsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
                          Refresh
                        </Button>
                      </div>

                      {/* Date Range Filter */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Filter by Date Range</CardTitle>
                          <CardDescription>Select a date range to view translation statistics</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="start-date">Start Date</Label>
                              <Input
                                id="start-date"
                                type="date"
                                value={dateRange.startDate}
                                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="end-date">End Date</Label>
                              <Input
                                id="end-date"
                                type="date"
                                value={dateRange.endDate}
                                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                              />
                            </div>
                            <div className="flex items-end">
                              <Button onClick={loadAnalytics} className="w-full">
                                Apply Filter
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {analyticsLoading ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                      ) : usageStats ? (
                        <>
                          {/* Key Metrics */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Active Translators</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                              </CardHeader>
                              <CardContent>
                                <div className="text-2xl font-bold">{usageStats.statistics?.activeTranslators || 0}</div>
                                <p className="text-xs text-muted-foreground">
                                  Users with preferred language ≠ English
                                </p>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Most Popular Language</CardTitle>
                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                              </CardHeader>
                              <CardContent>
                                <div className="text-2xl font-bold">
                                  {usageStats.statistics?.mostPopularLanguage?.language?.toUpperCase() || 'N/A'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {usageStats.statistics?.mostPopularLanguage?.count || 0} users
                                </p>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Custom Translations</CardTitle>
                                <Globe className="h-4 w-4 text-muted-foreground" />
                              </CardHeader>
                              <CardContent>
                                <div className="text-2xl font-bold">
                                  {usageStats.statistics?.customTranslationsByLanguage?.reduce((acc, cur) => acc + (cur.count || 0), 0) || 0}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Total custom translations across languages
                                </p>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Charts */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Language Distribution (custom translations per language) */}
                            <Card>
                              <CardHeader>
                                <CardTitle>Top Languages (custom translations)</CardTitle>
                                <CardDescription>Number of custom translations per language</CardDescription>
                              </CardHeader>
                              <CardContent>
                                {usageStats.statistics?.customTranslationsByLanguage?.length > 0 ? (
                                  <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={usageStats.statistics.customTranslationsByLanguage.slice(0, 10)}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="language" />
                                      <YAxis />
                                      <Tooltip />
                                      <Legend />
                                      <Bar dataKey="count" fill="#8884d8" name="Custom Translations" />
                                    </BarChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                    No data available
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>

                          {/* Recent activity table removed — charts provide analytics overview */}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <BarChart3 className="h-12 w-12 mb-4" />
                          <p>No analytics data available</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default GlobalTranslationsPage;