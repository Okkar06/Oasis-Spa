import useMemberStore from '@/stores/useMemberStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { ArrowLeft, Edit, Loader2, User, Mail, Phone, Calendar, MapPin, CreditCard, Users } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';

const ViewMemberPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    getMemberById,
    selectedMember,
    isFetchingSingle,
    error: storeError,
    errorMessage: storeErrorMessage,
  } = useMemberStore();

  const [error, setError] = useState(null);

  // Format date helper
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return new Intl.DateTimeFormat('en-SG', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }, []);

  // Load member data on component mount
  useEffect(() => {
    const loadMember = async () => {
      if (!id) {
        setError('Member ID is required');
        return;
      }

      try {
        setError(null);
        await getMemberById(id);
      } catch (err) {
        setError('Failed to load member data');
        console.error('Error loading member:', err);
      }
    };

    loadMember();
  }, [id, getMemberById]);

  // Handle store errors
  useEffect(() => {
    if (storeError && storeErrorMessage) {
      setError(storeErrorMessage);
    }
  }, [storeError, storeErrorMessage]);

  // Loading state
  if (isFetchingSingle) {
    return (
      <div className='[--header-height:calc(theme(spacing.14))]'>
        <SidebarProvider className='flex flex-col'>
          <SiteHeader />
          <div className='flex flex-1'>
            <AppSidebar />
            <SidebarInset>
              <div className='w-full max-w-none p-6'>
                <div className='flex items-center justify-center h-64'>
                  <div className='flex items-center gap-2'>
                    <Loader2 className='h-6 w-6 animate-spin' />
                    <span className='text-lg'>Loading member data...</span>
                  </div>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    );
  }

  // Error state
  if (error && !selectedMember) {
    return (
      <div className='[--header-height:calc(theme(spacing.14))]'>
        <SidebarProvider className='flex flex-col'>
          <SiteHeader />
          <div className='flex flex-1'>
            <AppSidebar />
            <SidebarInset>
              <div className='w-full max-w-none p-6'>
                <div className='flex items-center gap-3 mb-6'>
                  <Link to='/member'>
                    <Button variant='ghost' size='sm' className='p-2'>
                      <ArrowLeft className='h-4 w-4' />
                    </Button>
                  </Link>
                  <div>
                    <h1 className='text-2xl font-semibold text-gray-900'>View Member</h1>
                  </div>
                </div>
                <div className='bg-red-50 border border-red-200 rounded-md p-4'>
                  <p className='text-red-800 text-sm'>{error}</p>
                </div>
                <div className='mt-4'>
                  <Link to='/member'>
                    <Button variant='outline'>Back to Members</Button>
                  </Link>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    );
  }

  const InfoRow = ({ icon: Icon, label, value }) => (
    <div className='flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors'>
      <div className='mt-1'>
        <Icon className='h-4 w-4 text-gray-500' />
      </div>
      <div className='flex-1'>
        <p className='text-xs text-gray-500 mb-1'>{label}</p>
        <p className='text-sm font-medium text-gray-900'>
          {value || <span className='text-gray-400'>Not provided</span>}
        </p>
      </div>
    </div>
  );

  return (
    <div className='[--header-height:calc(theme(spacing.14))]'>
      <SidebarProvider className='flex flex-col'>
        <SiteHeader />
        <div className='flex flex-1'>
          <AppSidebar />
          <SidebarInset>
            <div className='container mx-auto p-4 space-y-6'>
              {/* Header Section */}
              <div className='flex items-center justify-between mb-6'>
                <div className='flex items-center gap-3'>
                  <Link to='/member'>
                    <Button variant='ghost' size='sm' className='p-2'>
                      <ArrowLeft className='h-4 w-4' />
                    </Button>
                  </Link>
                  <div>
                    <h1 className='text-2xl font-semibold text-gray-900'>Member Details</h1>
                    <p className='text-sm text-gray-600 mt-1'>View complete member information</p>
                  </div>
                </div>
                <Link to={`/member/edit/${id}`}>
                  <Button className='bg-blue-600 hover:bg-blue-700'>
                    <Edit className='h-4 w-4 mr-2' />
                    Edit Member
                  </Button>
                </Link>
              </div>

              {/* Member Summary Card */}
              <Card className='bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'>
                <CardContent className='pt-6'>
                  <div className='flex items-center gap-4'>
                    <div className='h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold'>
                      {selectedMember?.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <h2 className='text-2xl font-bold text-gray-900'>{selectedMember?.name}</h2>
                      <div className='flex items-center gap-4 mt-2 text-sm text-gray-600'>
                        <span className='flex items-center gap-1'>
                          <Mail className='h-3 w-3' />
                          {selectedMember?.email || 'No email'}
                        </span>
                        <span className='flex items-center gap-1'>
                          <Phone className='h-3 w-3' />
                          {selectedMember?.contact || 'No contact'}
                        </span>
                        <span className='flex items-center gap-1'>
                          <CreditCard className='h-3 w-3' />
                          {selectedMember?.card_number || 'No card'}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Basic Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className='text-lg font-medium flex items-center gap-2'>
                    <User className='h-5 w-5' />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                    <InfoRow icon={User} label='Full Name' value={selectedMember?.name} />
                    <InfoRow icon={Mail} label='Email Address' value={selectedMember?.email} />
                    <InfoRow icon={Phone} label='Contact Number' value={selectedMember?.contact} />
                    <InfoRow icon={CreditCard} label='NRIC/ID Number' value={selectedMember?.nric} />
                    <InfoRow
                      icon={Calendar}
                      label='Date of Birth'
                      value={selectedMember?.dob ? formatDate(selectedMember.dob) : 'Not provided'}
                    />
                    <InfoRow icon={User} label='Gender' value={selectedMember?.sex} />
                    <InfoRow icon={CreditCard} label='Card Number' value={selectedMember?.card_number} />
                    <InfoRow icon={Users} label='Membership Type' value={selectedMember?.membership_type_name} />
                  </div>
                  <div className='mt-4'>
                    <InfoRow icon={MapPin} label='Address' value={selectedMember?.address} />
                  </div>
                </CardContent>
              </Card>

              {/* Account Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className='text-lg font-medium flex items-center gap-2'>
                    <Calendar className='h-5 w-5' />
                    Account Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                    <InfoRow icon={Calendar} label='Created Date' value={formatDate(selectedMember?.created_at)} />
                    <InfoRow icon={User} label='Created By' value={selectedMember?.created_by_name} />
                    <InfoRow icon={Calendar} label='Last Updated' value={formatDate(selectedMember?.updated_at)} />
                    <InfoRow icon={Calendar} label='Last Visited' value={formatDate(selectedMember?.last_visit_date)} />
                    <InfoRow
                      icon={CreditCard}
                      label='Outstanding Amount'
                      value={selectedMember?.total_amount_owed ? `$${selectedMember.total_amount_owed}` : '$0.00'}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Remarks Card */}
              {selectedMember?.remarks && (
                <Card>
                  <CardHeader>
                    <CardTitle className='text-lg font-medium'>Remarks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className='text-sm text-gray-700 whitespace-pre-wrap'>{selectedMember.remarks}</p>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons */}
              <div className='flex justify-between items-center pt-6 border-t'>
                <Link to='/member'>
                  <Button variant='outline'>
                    <ArrowLeft className='h-4 w-4 mr-2' />
                    Back to Members List
                  </Button>
                </Link>
                <Link to={`/member/edit/${id}`}>
                  <Button className='bg-blue-600 hover:bg-blue-700'>
                    <Edit className='h-4 w-4 mr-2' />
                    Edit This Member
                  </Button>
                </Link>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default ViewMemberPage;
