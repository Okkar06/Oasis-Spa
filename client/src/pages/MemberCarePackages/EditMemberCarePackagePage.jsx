import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Package, X, User, CreditCard, DollarSign, Lock, Edit3, Trash2 } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { NotFoundState } from '@/components/NotFoundState';
import { useMcpSpecificStore } from '@/stores/MemberCarePackage/useMcpSpecificStore';
import { useCpFormStore } from '@/stores/CarePackage/useCpFormStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FormProvider, useForm } from 'react-hook-form';
import { EmployeeSelect } from '@/components/ui/forms/EmployeeSelect';
import ServiceItem from '@/pages/CarePackages/ServiceItem';
import ServiceSelection from '@/pages/CarePackages/ServiceSelection';
import api from '@/services/api';

const EditMemberCarePackagePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Optimize Zustand subscriptions to prevent unnecessary re-renders
  const { currentPackage, isLoading, error, fetchPackageById, clearCurrentPackage, clearError } = useMcpSpecificStore();

  const { getEnabledServiceById, serviceOptions, fetchServiceOptions } = useCpFormStore();

  // Form setup for employee selection
  const methods = useForm({
    defaultValues: {
      employee_id: null,
    },
  });

  const [packageRemarks, setPackageRemarks] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');

  const [originalRemarks, setOriginalRemarks] = useState('');
  const [originalTotalPrice, setOriginalTotalPrice] = useState('');
  const [originalCurrentBalance, setOriginalCurrentBalance] = useState('');

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [employeeError, setEmployeeError] = useState('');

  const [serviceNames, setServiceNames] = useState({});
  const [serviceData, setServiceData] = useState({});
  const [loadingServiceNames, setLoadingServiceNames] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [editedServices, setEditedServices] = useState([]); // Store edited service data
  const [isInitialized, setIsInitialized] = useState(false);

  // Service form state for adding new services
  const [serviceForm, setServiceForm] = useState({
    id: '',
    name: '',
    price: 0,
    originalPrice: 0,
    discount: 1,
    quantity: 1,
  });

  useEffect(() => {
    if (id) {
      fetchPackageById(id);
      setIsInitialized(false); // Reset when ID changes
    }

    return () => {
      clearCurrentPackage();
      clearError();
    };
  }, [id, fetchPackageById, clearCurrentPackage, clearError]);

  // Fetch service options for the service dropdown
  useEffect(() => {
    fetchServiceOptions();
  }, [fetchServiceOptions]);

  useEffect(() => {
    if (currentPackage?.package && !isInitialized) {
      const remarks = currentPackage.package.package_remarks || '';
      const price = parseFloat(currentPackage.package.total_price || 0).toFixed(2);
      const balance = parseFloat(currentPackage.package.balance || 0).toFixed(2);

      setPackageRemarks(remarks);
      setOriginalRemarks(remarks);
      setTotalPrice(price);
      setOriginalTotalPrice(price);
      setCurrentBalance(balance);
      setOriginalCurrentBalance(balance);
      setIsInitialized(true);
    }
  }, [currentPackage, isInitialized]);

  useEffect(() => {
    const hasChanges =
      packageRemarks !== originalRemarks ||
      totalPrice !== originalTotalPrice ||
      currentBalance !== originalCurrentBalance;
    setHasUnsavedChanges(hasChanges);
  }, [packageRemarks, originalRemarks, totalPrice, originalTotalPrice, currentBalance, originalCurrentBalance]);

  useEffect(() => {
    const fetchServiceNames = async () => {
      if (!currentPackage?.details) return;

      setLoadingServiceNames(true);
      try {
        const serviceIds = [...new Set(currentPackage.details.map((d) => d.service_id))];
        // Filter out IDs we already have names for
        const newServiceIds = serviceIds.filter((id) => !serviceNames[id]);

        if (newServiceIds.length === 0) {
          setLoadingServiceNames(false);
          return;
        }

        const servicePromises = newServiceIds.map(async (serviceId) => {
          try {
            const serviceData = await getEnabledServiceById(serviceId);
            return {
              id: serviceId,
              name: serviceData.service_name || `Service ${serviceId}`,
              data: serviceData,
            };
          } catch (error) {
            console.error(`Error fetching service ${serviceId}:`, error);
            return {
              id: serviceId,
              name: `Service ${serviceId}`,
              error: true,
            };
          }
        });

        const serviceResponses = await Promise.all(servicePromises);

        const newServiceMap = { ...serviceNames };
        const newServiceDataMap = { ...serviceData };
        serviceResponses.forEach((response) => {
          newServiceMap[response.id] = response.name;
          if (response.data) {
            newServiceDataMap[response.id] = response.data;
          }
        });

        setServiceNames(newServiceMap);
        setServiceData(newServiceDataMap);
      } catch (error) {
        console.error('Error fetching service names:', error);
        const fallbackMap = {};
        currentPackage.details.forEach((detail) => {
          fallbackMap[detail.service_id] = `Service ${detail.service_id}`;
        });
        setServiceNames(fallbackMap);
      } finally {
        setLoadingServiceNames(false);
      }
    };

    fetchServiceNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPackage?.details]);

  // Service edit handlers
  const handleEditService = (index) => {
    setEditingService(index);
  };

  const handleSaveEditedService = async (index, updatedData) => {
    // Update the service data immediately
    const packageDetails = currentPackage.details || [];
    const transformedServices = transformPackageDetailsToServices(packageDetails);

    // Apply any previous edits
    let servicesWithEdits = [...transformedServices];
    editedServices.forEach((edit) => {
      if (servicesWithEdits[edit.index]) {
        servicesWithEdits[edit.index] = { ...servicesWithEdits[edit.index], ...edit.data };
      }
    });

    // Apply the new edit
    servicesWithEdits[index] = {
      ...servicesWithEdits[index],
      id: updatedData.service_id || servicesWithEdits[index].id,
      name: updatedData.name || servicesWithEdits[index].name,
      price: updatedData.price,
      discount: updatedData.discount,
      quantity: updatedData.quantity,
      remaining_quantity: updatedData.quantity, // Reset remaining quantity to new quantity when edited
      originalPrice: updatedData.originalPrice || servicesWithEdits[index].originalPrice,
    };

    // Store the edit
    const newEdits = editedServices.filter((e) => e.index !== index);
    newEdits.push({
      index,
      data: {
        id: updatedData.service_id || servicesWithEdits[index].id,
        name: updatedData.name || servicesWithEdits[index].name,
        price: updatedData.price,
        discount: updatedData.discount,
        quantity: updatedData.quantity,
        remaining_quantity: updatedData.quantity,
        originalPrice: updatedData.originalPrice || servicesWithEdits[index].originalPrice,
      },
    });

    setEditedServices(newEdits);

    // Also update local serviceNames so it shows up correctly
    if (updatedData.name) {
      setServiceNames((prev) => ({
        ...prev,
        [updatedData.service_id]: updatedData.name,
      }));
    }

    setEditingService(null);
    setHasUnsavedChanges(true);
  };

  const handleCancelEditService = () => {
    setEditingService(null);
  };

  const handleRemoveService = (index) => {
    if (confirm('Are you sure you want to remove this service?')) {
      // Mark service for removal by setting quantity to 0 or adding a flag
      const packageDetails = currentPackage.details || [];
      const transformedServices = transformPackageDetailsToServices(packageDetails);

      const newEdits = editedServices.filter((e) => e.index !== index);
      newEdits.push({
        index,
        data: {
          ...transformedServices[index],
          _removed: true, // Flag for removal
        },
      });

      setEditedServices(newEdits);
      setHasUnsavedChanges(true);
    }
  };

  // Service form handlers for adding new services
  const handleServiceSelect = (service) => {
    setServiceForm({
      id: service.id,
      name: service.name || service.service_name,
      price: service.price || service.service_price || 0,
      originalPrice: service.originalPrice || service.service_price || service.price || 0,
      discount: 1,
      quantity: 1,
    });
  };

  const updateServiceFormField = (field, value) => {
    setServiceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddService = () => {
    if (!serviceForm.id || !serviceForm.name || serviceForm.quantity <= 0) return;

    // Add new service to editedServices as a new entry
    const newService = {
      id: serviceForm.id,
      name: serviceForm.name,
      price: serviceForm.price,
      originalPrice: serviceForm.originalPrice,
      discount: serviceForm.discount,
      quantity: serviceForm.quantity,
      remaining_quantity: serviceForm.quantity, // New service starts with full quantity
      _isNew: true, // Flag to indicate this is a new service
    };

    setEditedServices([...editedServices, { index: -1, data: newService, _isNew: true }]);

    // Also update local serviceNames so it shows up correctly if needed
    setServiceNames((prev) => ({
      ...prev,
      [newService.id]: newService.name,
    }));

    setHasUnsavedChanges(true);
    resetServiceForm();
  };

  const resetServiceForm = () => {
    setServiceForm({
      id: '',
      name: '',
      price: 0,
      originalPrice: 0,
      discount: 1,
      quantity: 1,
    });
  };

  const getDiscountPercentage = (discountFactor) => {
    if (discountFactor === undefined || discountFactor === null || discountFactor === '') return '0';
    const factor = parseFloat(discountFactor);
    if (isNaN(factor)) return '0';
    const discountPercent = (1 - factor) * 100;
    return Math.max(0, discountPercent).toFixed(1);
  };

  const transformPackageDetailsToServices = useCallback(
    (packageDetails) => {
      return packageDetails.map((detail) => {
        const serviceInfo = serviceData[detail.service_id] || {};

        return {
          mcpd_id: detail.id,
          status: detail.status,
          id: detail.service_id || 0,
          name: detail.service_name || serviceNames[detail.service_id] || `Service ${detail.service_id}`,
          quantity: parseInt(detail.quantity) || 1,
          price: parseFloat(detail.price) || 0,
          originalPrice: parseFloat(serviceInfo.service_price) || parseFloat(detail.price) || 0,
          discount: parseFloat(detail.discount) || 1,
          service_description: serviceInfo.service_description || '',
          service_remarks: serviceInfo.service_remarks || detail.service_remarks || '',
          service_duration: serviceInfo.service_duration || 45,
          service_category_name: serviceInfo.service_category_name || '',
          remaining_quantity: detail.remaining_quantity || detail.quantity,
        };
      });
    },
    [serviceData, serviceNames],
  );

  const calculateTotalValue = (transformedServices) => {
    return transformedServices.reduce((total, service) => {
      const unitPrice = service.price * service.discount;
      return total + unitPrice * service.quantity;
    }, 0);
  };

  const calculateRemainingBalance = (transformedServices) => {
    return transformedServices.reduce((total, service) => {
      const unitPrice = service.price * service.discount;
      return total + unitPrice * (service.remaining_quantity || 0);
    }, 0);
  };

  const handleSave = async () => {
    if (!hasUnsavedChanges) return;

    // Validate employee selection
    const employeeId = methods.getValues('employee_id');
    if (!employeeId) {
      setEmployeeError('Please select an employee');
      return;
    }

    // Validate price and balance are valid numbers
    const priceValue = parseFloat(totalPrice);
    const balanceValue = parseFloat(currentBalance);

    if (isNaN(priceValue) || priceValue < 0) {
      setSaveError('Please enter a valid Total Price (must be 0 or greater)');
      return;
    }

    if (isNaN(balanceValue) || balanceValue < 0) {
      setSaveError('Please enter a valid Current Balance (must be 0 or greater)');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setEmployeeError('');

    try {
      const packageData = currentPackage.package;
      const packageDetails = currentPackage.details || [];

      // Calculate final services set including edits/additions/removals
      let servicesToSave = transformPackageDetailsToServices(packageDetails);

      // Apply edited services (existing ones)
      editedServices.forEach((edit) => {
        if (edit._isNew) return; // Skip new services for now
        if (servicesToSave[edit.index] && !edit.data._removed) {
          servicesToSave[edit.index] = { ...servicesToSave[edit.index], ...edit.data };
        }
      });

      // Filter out removed services
      servicesToSave = servicesToSave.filter((_, index) => {
        const edit = editedServices.find((e) => e.index === index);
        return !edit || !edit.data._removed;
      });

      // Add new services
      const newServices = editedServices.filter((edit) => edit._isNew).map((edit) => edit.data);
      servicesToSave = [...servicesToSave, ...newServices];

      // Format for API
      const services = servicesToSave.map((s) => ({
        id: String(s.id),
        name: s.name,
        quantity: parseInt(s.quantity) || 1,
        price: parseFloat(s.price) || 0,
        discount: parseFloat(s.discount) || 1,
      }));

      await api.put('/mcp/update', {
        id: packageData.id,
        package_name: packageData.package_name,
        package_remarks: packageRemarks.trim(),
        package_price: priceValue,
        package_balance: balanceValue,
        services: services,
        status: packageData.status || 'ENABLED',
        employee_id: employeeId,
        updated_at: new Date().toISOString(),
      });

      setOriginalRemarks(packageRemarks);
      setOriginalTotalPrice(totalPrice);
      setOriginalCurrentBalance(currentBalance);
      setEditedServices([]); // Reset edits
      setHasUnsavedChanges(false);
      setSaveSuccess(true);

      // Refresh the package data
      await fetchPackageById(id);

      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Failed to update package:', err);
      setSaveError(err.response?.data?.message || err.message || 'Failed to update package');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPackageRemarks(originalRemarks);
    setTotalPrice(originalTotalPrice);
    setCurrentBalance(originalCurrentBalance);
    setHasUnsavedChanges(false);
    setSaveError(null);
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        window.history.back();
      }
    } else {
      window.history.back();
    }
  };

  if (!id) {
    return <NotFoundState />;
  }

  const renderMainContent = () => {
    if (isLoading && !currentPackage) {
      return <LoadingState />;
    }

    if (error && !currentPackage) {
      return <ErrorState error={error} />;
    }

    if (!currentPackage || !currentPackage.package) {
      return <NotFoundState />;
    }

    const packageData = currentPackage.package;
    const packageDetails = currentPackage.details || [];
    let transformedServices = transformPackageDetailsToServices(packageDetails);

    // Apply edited services
    editedServices.forEach((edit) => {
      if (edit._isNew) {
        // Skip new services here, we'll add them separately
        return;
      }
      if (transformedServices[edit.index] && !edit.data._removed) {
        transformedServices[edit.index] = { ...transformedServices[edit.index], ...edit.data };
      }
    });

    // Filter out removed services
    transformedServices = transformedServices.filter((_, index) => {
      const edit = editedServices.find((e) => e.index === index);
      return !edit || !edit.data._removed;
    });

    // Add new services at the end
    const newServices = editedServices.filter((edit) => edit._isNew).map((edit) => edit.data);
    transformedServices = [...transformedServices, ...newServices];

    const totalValue = calculateTotalValue(transformedServices);
    const remainingBalance = calculateRemainingBalance(transformedServices);

    return (
      <div className='min-h-screen bg-gray-50'>
        {/* Header */}
        <div className='bg-white border-b border-gray-200 px-4 py-3'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-3'>
              <Button
                variant='ghost'
                onClick={handleBack}
                className='flex items-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2 py-1'
              >
                <ArrowLeft className='w-4 h-4 mr-1' />
                Back
              </Button>
              <div>
                <h1 className='text-lg font-semibold text-gray-900'>Edit Member Care Package</h1>
                {hasUnsavedChanges && <p className='text-xs text-amber-600 mt-1'>• Unsaved changes</p>}
              </div>
            </div>
            <div className='flex space-x-2'>
              <Button
                onClick={handleReset}
                variant='outline'
                className='flex items-center text-sm px-3 py-2'
                disabled={!hasUnsavedChanges || isSaving}
              >
                <X className='w-4 h-4 mr-1' />
                Reset Changes
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || isSaving}
                className={`flex items-center text-sm px-3 py-2 ${
                  hasUnsavedChanges && !isSaving
                    ? 'bg-gray-900 hover:bg-black text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Save className='w-4 h-4 mr-1' />
                {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Update Package' : 'No Changes'}
              </Button>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {(saveSuccess || saveError) && (
          <div className='max-w-7xl mx-auto px-4 py-2'>
            {saveSuccess && (
              <Alert className='bg-green-50 border-green-200'>
                <AlertCircle className='h-4 w-4 text-green-600' />
                <AlertDescription className='text-green-800'>Package updated successfully!</AlertDescription>
              </Alert>
            )}

            {saveError && (
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className='max-w-7xl mx-auto px-4 py-2'>
          <div className='space-y-3'>
            {/* Package Information Card */}
            <Card className='border-gray-200 shadow-sm'>
              <CardHeader className='border-b border-gray-100 px-4 py-1'>
                <CardTitle className='flex items-center justify-between text-gray-900 text-base font-semibold'>
                  <div className='flex items-center'>
                    <Package className='w-4 h-4 text-gray-700 mr-2' />
                    Package Information
                  </div>
                  {packageData.id && (
                    <span className='text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded'>ID: {packageData.id}</span>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className='p-6'>
                {/* Employee Selection */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-6'>
                  <div>
                    <label className='block text-sm font-medium text-gray-600 mb-2 flex items-center'>
                      <User className='w-4 h-4 mr-2' />
                      UPDATED BY *
                    </label>
                    <FormProvider {...methods}>
                      <div className={employeeError ? 'border border-red-300 rounded bg-red-50' : ''}>
                        <EmployeeSelect name='employee_id' label='' />
                      </div>
                    </FormProvider>
                    {employeeError && <p className='text-red-600 text-xs mt-1'>{employeeError}</p>}
                  </div>
                </div>

                {/* Package Details */}
                <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                  <div className='md:col-span-2'>
                    <label className='block text-xs font-medium text-gray-600 mb-1 flex items-center'>
                      <Lock className='w-3 h-3 mr-1' />
                      PACKAGE NAME (read-only)
                    </label>
                    <Input
                      type='text'
                      value={packageData.package_name || ''}
                      className='w-full px-2 py-1 border border-gray-200 rounded text-sm bg-gray-50 text-gray-900 cursor-not-allowed'
                      readOnly
                      disabled
                    />
                    <p className='text-xs text-gray-500 mt-1'>Package names cannot be changed after purchase</p>
                  </div>

                  <div>
                    <label className='block text-xs font-medium text-gray-600 mb-1'>TOTAL PRICE</label>
                    <div className='relative'>
                      <DollarSign className='h-4 w-4 text-gray-400 absolute left-2 top-1/2 transform -translate-y-1/2' />
                      <Input
                        type='number'
                        value={totalPrice}
                        onChange={(e) => setTotalPrice(e.target.value)}
                        className='w-full pl-7 pr-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent'
                        placeholder='0.00'
                        min='0'
                        step='0.01'
                      />
                    </div>
                  </div>

                  <div>
                    <label className='block text-xs font-medium text-gray-600 mb-1'>CURRENT BALANCE</label>
                    <div className='relative'>
                      <CreditCard className='h-4 w-4 text-yellow-600 absolute left-2 top-1/2 transform -translate-y-1/2' />
                      <Input
                        type='number'
                        value={currentBalance}
                        onChange={(e) => setCurrentBalance(e.target.value)}
                        className='w-full pl-7 pr-2 py-1 border border-yellow-200 rounded text-sm bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent font-semibold'
                        placeholder='0.00'
                        min='0'
                        step='0.01'
                      />
                    </div>
                  </div>
                </div>

                {transformedServices.length > 0 && (
                  <div className='mt-4 pt-4 border-t border-gray-200'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1'>CALCULATED TOTAL</label>
                        <div className='text-gray-900 font-semibold px-2 py-1 bg-green-50 border border-green-200 rounded text-sm'>
                          ${totalValue.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <label className='block text-xs font-medium text-gray-600 mb-1'>REMAINING VALUE</label>
                        <div className='text-gray-900 font-semibold px-2 py-1 bg-purple-50 border border-purple-200 rounded text-sm'>
                          ${remainingBalance.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Package Remarks */}
                <div className='mt-4'>
                  <label className='block text-xs font-medium text-gray-600 mb-1'>PACKAGE REMARKS</label>
                  <textarea
                    value={packageRemarks}
                    onChange={(e) => setPackageRemarks(e.target.value)}
                    rows={3}
                    className='w-full px-2 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent'
                    placeholder='Add any additional notes or remarks about this package...'
                  />
                </div>
              </CardContent>
            </Card>

            {/* Add Services Card */}
            <Card className='border-gray-200 shadow-sm'>
              <CardHeader className='border-b border-gray-100 px-4 py-1'>
                <CardTitle className='text-gray-900 text-base font-semibold'>Add Services</CardTitle>
              </CardHeader>
              <CardContent className='p-3'>
                <ServiceSelection
                  serviceForm={serviceForm}
                  serviceOptions={serviceOptions}
                  isLoading={isLoading}
                  onServiceSelect={handleServiceSelect}
                  onFieldUpdate={updateServiceFormField}
                  onAddService={handleAddService}
                  onClearForm={resetServiceForm}
                  showOriginalPrice={true}
                  getDiscountPercentage={getDiscountPercentage}
                />
              </CardContent>
            </Card>

            {/* Package Services Card */}
            {transformedServices.length > 0 && (
              <Card className='border-gray-200 shadow-sm'>
                <CardHeader className='border-b border-gray-100 px-4 py-1'>
                  <CardTitle className='text-gray-900 text-base font-semibold'>
                    Package Services ({transformedServices.length} service{transformedServices.length !== 1 ? 's' : ''})
                  </CardTitle>
                </CardHeader>
                <CardContent className='p-3'>
                  {loadingServiceNames && <div className='text-sm text-blue-600 mb-2'>Loading service details...</div>}

                  <div className='space-y-3'>
                    {transformedServices.map((service, index) => (
                      <ServiceItem
                        key={index}
                        service={{
                          ...service,
                          name: service.name,
                        }}
                        index={index}
                        isEditing={editingService === index}
                        onEdit={() => handleEditService(index)}
                        onSave={(updatedData) => handleSaveEditedService(index, updatedData)}
                        onCancel={() => handleCancelEditService()}
                        onRemove={() => handleRemoveService(index)}
                      />
                    ))}
                  </div>

                  {/* Service Summary */}
                  <div className='mt-4 pt-4 border-t border-gray-200 bg-gray-50 rounded-lg p-4'>
                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-center'>
                      <div>
                        <div className='text-xs text-gray-600 mb-1'>TOTAL SERVICES</div>
                        <div className='text-lg font-semibold text-gray-900'>{transformedServices.length}</div>
                      </div>
                      <div>
                        <div className='text-xs text-gray-600 mb-1'>TOTAL SESSIONS</div>
                        <div className='text-lg font-semibold text-gray-900'>
                          {transformedServices.reduce((total, service) => total + (parseInt(service.quantity) || 0), 0)}
                        </div>
                      </div>
                      <div>
                        <div className='text-xs text-gray-600 mb-1'>BEFORE DISCOUNTS</div>
                        <div className='text-lg font-semibold text-gray-900'>
                          $
                          {transformedServices
                            .reduce(
                              (total, service) =>
                                total + (parseFloat(service.price) || 0) * (parseInt(service.quantity) || 0),
                              0,
                            )
                            .toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className='text-xs text-gray-600 mb-1'>FINAL TOTAL</div>
                        <div className='text-lg font-bold text-green-600'>${totalValue.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className='[--header-height:calc(theme(spacing.14))]'>
      <SidebarProvider className='flex flex-col'>
        <SiteHeader />
        <div className='flex flex-1'>
          <AppSidebar />
          <SidebarInset>{renderMainContent()}</SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default EditMemberCarePackagePage;
