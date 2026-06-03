import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lock } from 'lucide-react'; // Lucide icon
import { Checkbox } from '@/components/ui/checkbox'; // Import Checkbox
import { OasisMark } from '@/components/OasisMark';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false); // Add state for rememberMe
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { currentLanguage, setLanguage } = useLanguage();

  // Force login page to English while mounted
  useEffect(() => {
    const prev = currentLanguage;
    if (prev !== 'en') setLanguage('en');
    return () => {
      if (prev && prev !== 'en') setLanguage(prev);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('[data-reveal]'));
    elements.forEach((el) => el.classList.add('opacity-0', 'translate-y-4'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0');
            entry.target.classList.remove('opacity-0', 'translate-y-4');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const success = await login({ username, password, rememberMe }); // Pass rememberMe
      if (success) {
        navigate(from, { replace: true });
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An unexpected error occurred during login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='min-h-screen bg-background text-foreground' data-no-translate>
      <div className='sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/70 backdrop-blur'>
        <div className='mx-auto flex max-w-6xl items-center justify-between px-6 py-4'>
          <div className='flex items-center gap-3'>
            <div className='flex size-9 items-center justify-center rounded-lg border border-white/10 bg-[#111111]/60 text-[color:var(--accent)] shadow-[0_0_0_1px_rgba(201,169,110,0.12)]'>
              <OasisMark className='size-5' />
            </div>
            <span className='font-serif text-xl tracking-wide text-[color:var(--accent)]'>Oasis Spa</span>
            <span className='hidden sm:inline text-sm text-muted-foreground'>A sanctuary, always.</span>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => document.getElementById('login-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Reserve Your Experience
          </Button>
        </div>
      </div>

      <div className='mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-2 lg:py-16'>
        <div className='space-y-10'>
          <section data-reveal className='space-y-5 transition-all duration-700'>
            <h1 className='font-serif text-4xl leading-tight tracking-wide md:text-5xl'>
              Where stillness meets ritual.
            </h1>
            <p className='max-w-xl text-base text-muted-foreground md:text-lg'>
              Curated therapies for the body, mind, and spirit.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Button
                onClick={() =>
                  document.getElementById('login-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                Reserve Your Experience
              </Button>
              <Button
                variant='ghost'
                onClick={() => document.getElementById('rituals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Explore Rituals
              </Button>
            </div>
          </section>

          <section id='rituals' data-reveal className='space-y-4 transition-all duration-700'>
            <h2 className='font-serif text-2xl tracking-wide'>Our Rituals</h2>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <Card className='py-0'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-lg'>Therapeutic Bodywork</CardTitle>
                  <CardDescription>Slow pressure, warm oils, quiet precision.</CardDescription>
                </CardHeader>
                <CardContent className='pt-0 text-sm text-muted-foreground'>
                  Designed to ease tension and restore an unhurried, grounded body.
                </CardContent>
              </Card>
              <Card className='py-0'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-lg'>Facial Rituals</CardTitle>
                  <CardDescription>Glow that feels like calm.</CardDescription>
                </CardHeader>
                <CardContent className='pt-0 text-sm text-muted-foreground'>
                  Hydration, sculpting, and skin-first care for a luminous finish.
                </CardContent>
              </Card>
              <Card className='py-0 sm:col-span-2'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-lg'>Herbal Immersion</CardTitle>
                  <CardDescription>Steam, botanicals, and a softened mind.</CardDescription>
                </CardHeader>
                <CardContent className='pt-0 text-sm text-muted-foreground'>
                  An immersive reset inspired by Asian wellness traditions.
                </CardContent>
              </Card>
            </div>
          </section>

          <section data-reveal className='space-y-3 transition-all duration-700'>
            <h2 className='font-serif text-2xl tracking-wide'>About</h2>
            <p className='max-w-xl text-base text-muted-foreground'>
              Born from the belief that true beauty begins in stillness.
            </p>
          </section>

          <footer data-reveal className='border-t border-white/10 pt-6 transition-all duration-700'>
            <p className='text-sm text-muted-foreground'>Oasis Spa — A sanctuary, always.</p>
          </footer>
        </div>

        <div className='flex items-start justify-center lg:justify-end'>
          <Card id='login-card' data-reveal className='w-full max-w-sm transition-all duration-700'>
            <CardHeader className='space-y-1 text-center'>
              <div className='flex justify-center mb-4'>
                <Avatar>
                  <AvatarFallback>
                    <Lock className='h-6 w-6' />
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className='text-2xl font-bold'>Sign In</CardTitle>
              <CardDescription>Enter your email or username and password to continue.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='username'>Email or Username</Label>
                  <Input
                    id='username'
                    name='username'
                    type='text'
                    placeholder='you@example.com or you_123'
                    required
                    autoComplete='username'
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={error ? 'border-destructive' : ''}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='password'>Password</Label>
                  <Input
                    id='password'
                    name='password'
                    type='password'
                    placeholder='********'
                    required
                    autoComplete='current-password'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={error ? 'border-destructive' : ''}
                  />
                </div>
                <div className='flex items-center space-x-2'>
                  <Checkbox id='rememberMe' checked={rememberMe} onCheckedChange={setRememberMe} />
                  <Label
                    htmlFor='rememberMe'
                    className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                  >
                    Remember me
                  </Label>
                </div>
                {error && <p className='text-sm text-destructive text-center'>{error}</p>}
                <Button type='submit' disabled={isSubmitting} className='w-full'>
                  {isSubmitting ? 'Logging in...' : 'Login'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
