import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  Plus,
  Trash2,
  Package,
  User,
  Calendar,
  DollarSign,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Save,
  X,
} from 'lucide-react';
import EmployeeSelect from '@/components/ui/forms/EmployeeSelect';
import ServiceSelect from '@/components/ui/forms/ServiceSelect';
import CarePackageSelect from '@/components/ui/forms/CarePackageSelect';
import { useMcpFormStore } from '@/stores/MemberCarePackage/useMcpFormStore';
import { useMcpSpecificStore } from '@/stores/MemberCarePackage/useMcpSpecificStore';
import useMemberStore from '@/stores/useMemberStore';

const CreateMemberCarePackagePage = () => {
  const navigate = useNavigate();
  const {
    mainFormData,
    serviceForm,
    employeeOptions,
    serviceOptions,
    packageOptions,
    isLoading,
    error,
    updateMainField,
    resetMainForm,
    updateServiceFormField,
    selectService,
    addServiceToPackage,
    removeServiceFromPackage,
    updateServiceInPackage,
    resetServiceForm,
    fetchEmployeeOptions,
    fetchServiceOptions,
    fetchCarePackageOptions,
    selectCarePackage,
    setBypassMode,
  } = useMcpFormStore();

  const { createPackage } = useMcpSpecificStore();

  const { members, fetchMembers } = useMemberStore();

  const [selectedMember, setSelectedMember] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [bypassPackage, setBypassPackage] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Initialize data on component mount
  useEffect(() => {
    const initializeData = async () => {
      const promises = [];

      if (employeeOptions.length === 0) {
        promises.push(fetchEmployeeOptions());
      }
      if (serviceOptions.length === 0) {
        promises.push(fetchServiceOptions());
      }
      if (packageOptions.length === 0) {
        promises.push(fetchCarePackageOptions());
      }
      if (!members || members.length === 0) {
        promises.push(fetchMembers());
      }

      if (promises.length > 0) {
        try {
          await Promise.all(promises);
        } catch (error) {
          console.error('Error initializing form data:', error);
        }
      }
    };

    initializeData();
  }, [
    employeeOptions.length,
    serviceOptions.length,
    packageOptions.length,
    members,
    fetchEmployeeOptions,
    fetchServiceOptions,
    fetchCarePackageOptions,
    fetchMembers,
  ]);

  // Reset package selection when bypass changes
  useEffect(() => {
    // Sync bypass mode to the store so service actions respect it
    setBypassMode(bypassPackage);
    if (bypassPackage) {
      setSelectedPackageId(null);
      updateMainField('package_name', '');
      updateMainField('services', []);
    }
  }, [bypassPackage, updateMainField, setBypassMode]);

  // Filter members based on search
  const filteredMembers =
    members?.filter(
      (member) =>
        member.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
        member.email?.toLowerCase().includes(memberSearch.toLowerCase()) ||
        member.contact?.includes(memberSearch)
    ) || [];

  // Handle member selection
  const handleMemberSelect = (member) => {
    setSelectedMember(member);
    updateMainField('member_id', member.id);
    setShowMemberDropdown(false);
    setMemberSearch('');
  };

  // Handle care package selection
  const handlePackageSelect = (selectedPackage) => {
    if (selectedPackage && selectedPackage.id) {
      setSelectedPackageId(selectedPackage.id);
      // Ensure we pass the expected shape to the store
      selectCarePackage({ id: selectedPackage.id });
    }
  };

  // Calculate total price
  const calculateTotalPrice = () => {
    return mainFormData.services.reduce((total, service) => {
      const price = parseFloat(service.price) || 0;
      const discount = parseFloat(service.discount) || 1;
      const quantity = parseInt(service.quantity, 10) || 0;
      const finalPrice = price * discount;
      return total + finalPrice * quantity;
    }, 0);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!selectedMember) {
      alert('Please select a member');
      return;
    }

    if (!mainFormData.employee_id) {
      alert('Please select an employee');
      return;
    }

    if (!bypassPackage && !selectedPackageId) {
      alert('Please select a care package or enable custom package');
      return;
    }

    if (bypassPackage && !mainFormData.package_name) {
      alert('Please enter a package name for custom package');
      return;
    }

    if (mainFormData.services.length === 0) {
      alert('Please add at least one service');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build server-compatible payload
      const package_price = calculateTotalPrice();

      const singlePackage = {
        member_id: selectedMember.id,
        employee_id: mainFormData.employee_id,
        package_name: mainFormData.package_name,
        package_remarks: mainFormData.remarks || '',
        package_price: package_price,
        services: (mainFormData.services || []).map((service) => ({
          id: service.id || null,
          name: service.name,
          quantity: parseInt(service.quantity, 10) || 1,
          price: parseFloat(service.price) || 0,
          discount: parseFloat(service.discount) || 1,
          finalPrice: (parseFloat(service.price) || 0) * (parseFloat(service.discount) || 1),
        })),
      };

      const nowIso = new Date().toISOString();
      const result = await createPackage({
        packages: [singlePackage],
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (result) {
        alert('Member care package created successfully!');
        handleReset();
        navigate('/mcp');
      }
    } catch (err) {
      console.error('Error submitting member care package:', err);
      alert('Failed to create member care package: ' + (err.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form reset
  const handleReset = () => {
    resetMainForm();
    resetServiceForm();
    setSelectedMember(null);
    setSelectedPackageId(null);
    setBypassPackage(false);
  };

  return (
    <div className='[--header-height:calc(theme(spacing.14))]'>
      <SidebarProvider className='flex flex-col'>
        <SiteHeader />
        <div className='flex flex-1'>
          <AppSidebar />
          <SidebarInset>
            <div className='min-h-screen bg-gray-50'>
              {/* Header */}
              <div className='bg-white border-b border-gray-200 px-6 py-4'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center space-x-3'>
                    <Button
                      variant='ghost'
                      onClick={() => navigate('/mcp')}
                      className='flex items-center text-gray-600 hover:text-gray-900'
                    >
                      <ArrowLeft className='w-4 h-4 mr-2' />
                      Back
                    </Button>
                    <div>
                      <h1 className='text-2xl font-semibold text-gray-900'>Create Member Care Package</h1>
                      <p className='text-sm text-gray-600 mt-1'>Assign a care package to a member</p>
                    </div>
                  </div>
                  <div className='flex space-x-2'>
                    <Button onClick={handleReset} variant='outline' className='flex items-center'>
                      <X className='w-4 h-4 mr-2' />
                      Reset
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !selectedMember || mainFormData.services.length === 0}
                      className='flex items-center bg-blue-600 hover:bg-blue-700'
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Save className='w-4 h-4 mr-2' />
                          Create Package
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className='max-w-7xl mx-auto px-6 py-4'>
                  <div className='bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3'>
                    <AlertCircle className='w-5 h-5 text-red-600 mt-0.5' />
                    <div>
                      <p className='text-red-800 font-medium'>Error</p>
                      <p className='text-red-700 text-sm mt-1'>{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Content */}
              <div className='max-w-7xl mx-auto px-6 py-6 space-y-6'>
                {/* Member Selection Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center text-lg'>
                      <User className='w-5 h-5 mr-2 text-blue-600' />
                      Member Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div>
                      <Label htmlFor='member-search'>Select Member *</Label>
                      <div className='relative mt-2'>
                        <button
                          type='button'
                          onClick={() => setShowMemberDropdown(!showMemberDropdown)}
                          className='w-full px-4 py-2 border border-gray-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between'
                        >
                          <span className={selectedMember ? 'text-gray-900' : 'text-gray-400'}>
                            {selectedMember ? `${selectedMember.name} - ${selectedMember.email}` : 'Choose a member...'}
                          </span>
                          <User className='h-4 w-4 text-gray-400' />
                        </button>

                        {showMemberDropdown && (
                          <div className='absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto'>
                            <div className='p-2 border-b'>
                              <Input
                                type='text'
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                                placeholder='Search by name, email, or contact...'
                                className='w-full'
                              />
                            </div>
                            <div>
                              {filteredMembers.map((member) => (
                                <button
                                  key={member.id}
                                  type='button'
                                  onClick={() => handleMemberSelect(member)}
                                  className='w-full px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b last:border-b-0'
                                >
                                  <div className='font-medium text-gray-900'>{member.name}</div>
                                  <div className='text-sm text-gray-600'>
                                    {member.email} • {member.contact}
                                  </div>
                                </button>
                              ))}
                              {filteredMembers.length === 0 && (
                                <div className='px-4 py-3 text-sm text-gray-500'>No members found</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedMember && (
                      <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
                        <h4 className='font-medium text-blue-900 mb-2'>Selected Member Details</h4>
                        <div className='grid grid-cols-2 gap-3 text-sm'>
                          <div>
                            <span className='text-blue-700'>Name:</span>
                            <span className='ml-2 text-blue-900 font-medium'>{selectedMember.name}</span>
                          </div>
                          <div>
                            <span className='text-blue-700'>Email:</span>
                            <span className='ml-2 text-blue-900'>{selectedMember.email}</span>
                          </div>
                          <div>
                            <span className='text-blue-700'>Contact:</span>
                            <span className='ml-2 text-blue-900'>{selectedMember.contact}</span>
                          </div>
                          <div>
                            <span className='text-blue-700'>Card Number:</span>
                            <span className='ml-2 text-blue-900'>{selectedMember.card_number || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Package Selection Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center text-lg'>
                      <Package className='w-5 h-5 mr-2 text-green-600' />
                      Care Package Selection
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='flex items-center justify-between p-4 bg-gray-50 rounded-lg'>
                      <div>
                        <Label className='text-base font-medium'>Custom Package</Label>
                        <p className='text-sm text-gray-600 mt-1'>
                          Create a custom package instead of using a template
                        </p>
                      </div>
                      <label className='relative inline-flex items-center cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={bypassPackage}
                          onChange={(e) => setBypassPackage(e.target.checked)}
                          className='sr-only peer'
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {!bypassPackage && (
                      <div>
                        <Label htmlFor='package-select'>Select Care Package Template *</Label>
                        <CarePackageSelect
                          options={packageOptions}
                          value={selectedPackageId}
                          onSelect={handlePackageSelect}
                          isLoading={isLoading}
                          error={error}
                          placeholder='Choose a care package template...'
                          className='mt-2'
                        />
                      </div>
                    )}

                    {bypassPackage && (
                      <div>
                        <Label htmlFor='custom-package-name'>Custom Package Name *</Label>
                        <Input
                          id='custom-package-name'
                          type='text'
                          value={mainFormData.package_name}
                          onChange={(e) => updateMainField('package_name', e.target.value)}
                          placeholder='Enter custom package name'
                          className='mt-2'
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Employee & Dates Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center text-lg'>
                      <Calendar className='w-5 h-5 mr-2 text-purple-600' />
                      Assignment Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4 items-start'>
                      <div>
                        <EmployeeSelect
                          label='Assigned Employee *'
                          value={mainFormData.employee_id}
                          onChange={(value) => updateMainField('employee_id', value)}
                          placeholder='Select employee'
                          className='space-y-1'
                        />
                      </div>
                      <div>
                        <Label htmlFor='expiry-date'>Expiry Date</Label>
                        <Input
                          id='expiry-date'
                          type='date'
                          value={mainFormData.expiry_date}
                          onChange={(e) => updateMainField('expiry_date', e.target.value)}
                          className='mt-2'
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor='remarks'>Remarks</Label>
                      <Textarea
                        id='remarks'
                        value={mainFormData.remarks}
                        onChange={(e) => updateMainField('remarks', e.target.value)}
                        placeholder='Add any additional notes or remarks...'
                        rows={3}
                        className='mt-2'
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Services Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center text-lg'>
                      <DollarSign className='w-5 h-5 mr-2 text-orange-600' />
                      Services
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-4 gap-4 items-start'>
                      <div>
                        <ServiceSelect
                          label='Select Service *'
                          value={serviceForm.id}
                          onChange={(serviceId) => {
                            // Use the selected ID directly; the store accepts scalar or object
                            if (serviceId) {
                              selectService(serviceId);
                            }
                          }}
                          placeholder='Choose service'
                          className='space-y-0'
                        />
                      </div>
                      <div>
                        <Label htmlFor='quantity'>Quantity</Label>
                        <Input
                          id='quantity'
                          type='number'
                          value={serviceForm.quantity}
                          onChange={(e) => updateServiceFormField('quantity', parseInt(e.target.value) || 1)}
                          min='1'
                          className='mt-2'
                        />
                      </div>
                      <div>
                        <Label htmlFor='price'>Price per Unit</Label>
                        <Input
                          id='price'
                          type='number'
                          value={serviceForm.price}
                          onChange={(e) => updateServiceFormField('price', parseFloat(e.target.value) || 0)}
                          min='0'
                          step='0.01'
                          className='mt-2'
                        />
                      </div>
                      <div>
                        <Label htmlFor='discount'>Discount Factor</Label>
                        <Input
                          id='discount'
                          type='number'
                          value={serviceForm.discount}
                          onChange={(e) => updateServiceFormField('discount', e.target.value)}
                          min='0'
                          max='1'
                          step='0.01'
                          placeholder='1.0 = no discount'
                          className='mt-2'
                        />
                        {(() => {
                          const df = parseFloat(serviceForm.discount);
                          if (isNaN(df)) return null;
                          const clamped = Math.max(0, Math.min(1, df));
                          const pct = (1 - clamped) * 100;
                          if (!Number.isFinite(pct)) return null;
                          const formatted = Math.round(pct * 10) / 10; // one decimal max
                          return <div className='mt-1 text-xs text-gray-500'>{formatted}% off</div>;
                        })()}
                        
                      </div>
                    </div>

                    <div className='flex gap-2'>
                      <Button
                        type='button'
                        onClick={() => {
                          if (serviceForm.id && serviceForm.quantity > 0) {
                            addServiceToPackage();
                          }
                        }}
                        disabled={!serviceForm.id || serviceForm.quantity <= 0}
                        className='bg-green-600 hover:bg-green-700'
                      >
                        <Plus className='w-4 h-4 mr-2' />
                        Add Service
                      </Button>
                      <Button type='button' onClick={resetServiceForm} variant='outline'>
                        Clear
                      </Button>
                    </div>

                    {/* Services List */}
                    {mainFormData.services.length > 0 && (
                      <div className='mt-6'>
                        <h4 className='font-medium text-gray-900 mb-3'>Added Services</h4>
                        <div className='space-y-2'>
                          {mainFormData.services.map((service, index) => {
                            const price = parseFloat(service.price) || 0;
                            const discount = parseFloat(service.discount) || 1;
                            const quantity = parseInt(service.quantity, 10) || 0;
                            const finalPrice = price * discount;
                            const subtotal = finalPrice * quantity;

                            return (
                              <div
                                key={index}
                                className='flex items-center justify-between p-4 bg-gray-50 rounded-lg border'
                              >
                                <div className='flex-1'>
                                  <div className='font-medium text-gray-900'>{service.name}</div>
                                  <div className='text-sm text-gray-600 mt-1'>
                                    Qty: {quantity} × ${price.toFixed(2)} (Discount: {discount.toFixed(2)}) = $
                                    {subtotal.toFixed(2)}
                                  </div>
                                </div>
                                <Button
                                  type='button'
                                  onClick={() => removeServiceFromPackage(index)}
                                  variant='ghost'
                                  size='sm'
                                  className='text-red-600 hover:text-red-700 hover:bg-red-50'
                                >
                                  <Trash2 className='w-4 h-4' />
                                </Button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Total Price */}
                        <div className='mt-4 pt-4 border-t'>
                          <div className='flex items-center justify-between'>
                            <span className='text-lg font-medium text-gray-900'>Total Price:</span>
                            <span className='text-2xl font-bold text-green-600'>
                              ${calculateTotalPrice().toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {mainFormData.services.length === 0 && (
                      <div className='text-center py-8 text-gray-500'>
                        <Package className='w-12 h-12 mx-auto mb-3 opacity-50' />
                        <p>No services added yet. Add services to create the package.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default CreateMemberCarePackagePage;
