import { useState, useEffect } from 'react';
import api from '@/services/api';
import { Search, Loader2, Package, ShoppingCart, Plus, Trash2, List } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useTransactionCartStore from '@/stores/useTransactionCartStore';
import { useMcpFormStore } from '@/stores/MemberCarePackage/useMcpFormStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import EmployeeSelect from '@/components/ui/forms/EmployeeSelect';
import ServiceSelect from '@/components/ui/forms/ServiceSelect';
import CarePackageSelect from '@/components/ui/forms/CarePackageSelect';

const CarePackageTab = () => {
  const [loading, setLoading] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [error, setError] = useState('');
  const [carePackages, setCarePackages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'create'

  // Custom Create Form State
  const [bypassPackage, setBypassPackage] = useState(true); // Default to true for custom creation
  const [selectedPackageId, setSelectedPackageId] = useState(null);

  const { selectedMember, addCartItem } = useTransactionCartStore();

  // Store for creation form
  const {
    mainFormData,
    serviceForm,
    employeeOptions,
    serviceOptions,
    packageOptions,
    isCustomizable,
    // isLoading: storeLoading, // Conflict with local loading
    // error: storeError, // Conflict with local error
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
    addMcpToCreationQueue,
    setBypassMode,
  } = useMcpFormStore();

  // Initial Data Fetching
  useEffect(() => {
    const fetchCarePackages = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await api.get('/cp/pkg', {
          params: { searchTerm: searchQuery, limit: 50 },
        });

        if (response.data && response.data.data) {
          setCarePackages(response.data.data);
        } else {
          setCarePackages([]);
        }
      } catch (err) {
        console.error('Error fetching care packages:', err);
        setError(err.message || 'Failed to fetch care packages');
      } finally {
        setLoading(false);
      }
    };

    if (viewMode === 'list') {
      fetchCarePackages();
    }
  }, [searchQuery, viewMode]);

  // Initialize options for Create Mode
  useEffect(() => {
    const initializeData = async () => {
      if (viewMode === 'create') {
        if (employeeOptions.length === 0) fetchEmployeeOptions();
        if (serviceOptions.length === 0) fetchServiceOptions();
        if (packageOptions.length === 0) fetchCarePackageOptions();

        // Ensure we start fresh or in correct mode
        setBypassMode(true);
      }
    };
    initializeData();
  }, [
    viewMode,
    employeeOptions.length,
    serviceOptions.length,
    packageOptions.length,
    fetchEmployeeOptions,
    fetchServiceOptions,
    fetchCarePackageOptions,
    setBypassMode,
  ]);

  // Sync package name cleanup
  useEffect(() => {
    if (!mainFormData.package_name) {
      setSelectedPackageId(null);
    }
  }, [mainFormData.package_name]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleAddToCart = async (carePackage) => {
    try {
      setAddingToCart(true);

      const response = await api.get(`/cp/pkg/${carePackage.id}`);
      const data = response.data;

      if (!data || !data.details) {
        throw new Error('Could not fetch package details');
      }

      const services = data.details.map((s) => {
        const serviceOption = serviceOptions.find((f) => f.id == s.service_id);
        const price = Number(s.care_package_item_details_price) || 0;
        const discount =
          s.care_package_item_details_discount !== null ? Number(s.care_package_item_details_discount) : 1;
        const finalPrice = price * discount;

        return {
          id: s.service_id,
          name: serviceOption?.label || 'Unknown Service',
          quantity: Number(s.care_package_item_details_quantity) || 1,
          price: price,
          discount: discount,
          finalPrice: finalPrice,
        };
      });

      const mcpId = crypto.randomUUID();

      const cartPackageData = {
        id: mcpId,
        package_name: carePackage.care_package_name,
        package_price: Number(carePackage.care_package_price),
        package_remarks: carePackage.care_package_remarks,
        services: services,
        member_id: selectedMember?.id || null,
        employee_id: data.package.created_by,
        is_custom: false,
        template_package_id: carePackage.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      addCartItem({
        id: mcpId,
        type: 'package',
        data: {
          ...cartPackageData,
          name: cartPackageData.package_name,
          price: cartPackageData.package_price,
          description: cartPackageData.package_remarks,
        },
      });

      addMcpToCreationQueue(cartPackageData);
    } catch (err) {
      console.error('Error adding to cart:', err);
      alert('Failed to add package to cart: ' + err.message);
    } finally {
      setAddingToCart(false);
    }
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();

    if (!mainFormData.employee_id) {
      alert('Please select an employee');
      return;
    }

    if (bypassPackage && !mainFormData.package_name) {
      alert('Please enter a package name');
      return;
    }

    if (mainFormData.services.length === 0) {
      alert('Please add at least one service');
      return;
    }

    const mcpId = crypto.randomUUID();

    const cartPackageData = {
      id: mcpId,
      ...mainFormData,
      name: mainFormData.package_name,
      price: mainFormData.package_price,
      description: mainFormData.package_remarks,
      member_id: selectedMember?.id || null,
      is_custom: bypassPackage,
      template_package_id: selectedPackageId,
    };

    addCartItem({
      id: mcpId,
      type: 'package',
      data: cartPackageData,
    });

    addMcpToCreationQueue(cartPackageData);

    alert('Custom care package added to cart!');
    resetMainForm();
    setSelectedPackageId(null);
    // setBypassPackage(true); // Keep strictly custom?

    // Switch back to list view ? Or stay?
    // setViewMode('list');
  };

  const handlePackageSelectForCreate = (pkg) => {
    if (pkg) {
      setSelectedPackageId(pkg.id);
      selectCarePackage(pkg);
      setBypassPackage(false);
      setBypassMode(false);
    } else {
      resetMainForm();
      setSelectedPackageId(null);
      setBypassPackage(true);
      setBypassMode(true);
    }
  };

  const handleBypassToggle = (checked) => {
    setBypassPackage(checked);
    setBypassMode(checked);

    if (checked) {
      if (mainFormData.package_name && mainFormData.services.length > 0) {
        const keepTemplate = confirm(
          'You have a template selected. Would you like to keep its services as a starting point for your custom package?',
        );

        if (!keepTemplate) {
          resetMainForm();
          setSelectedPackageId(null);
        }
      }
    } else {
      if (selectedPackageId && mainFormData.package_name) {
        selectCarePackage({ id: selectedPackageId });
      } else if (!mainFormData.package_name) {
        resetMainForm();
        setSelectedPackageId(null);
      }
    }
  };

  const renderCarePackagesList = () => {
    if (loading) {
      return (
        <div className='flex justify-center items-center p-8'>
          <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
          <span className='ml-2 text-gray-600'>Loading care packages...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className='p-6 text-center'>
          <div className='text-red-500 mb-2'>Error loading care packages</div>
          <div className='text-sm text-gray-600'>{error}</div>
        </div>
      );
    }

    if (carePackages.length === 0) {
      return (
        <div className='text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200'>
          <Package className='h-12 w-12 mx-auto mb-2 text-gray-400' />
          <p className='text-sm'>
            {searchQuery ? `No care packages found matching "${searchQuery}"` : 'No care packages available'}
          </p>
          <Button variant='outline' onClick={() => setViewMode('create')} className='mt-4'>
            <Plus className='h-4 w-4 mr-2' />
            Create Custom Package
          </Button>
        </div>
      );
    }

    return (
      <div className='bg-white rounded-md shadow-sm overflow-hidden'>
        <div className='bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center justify-between'>
          <div className='flex items-center'>
            <Package className='h-4 w-4 mr-2 text-gray-600' />
            <h3 className='font-medium text-gray-700'>Available Care Packages</h3>
          </div>
          <Button
            size='sm'
            onClick={() => setViewMode('create')}
            variant='ghost'
            className='h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50'
          >
            <Plus className='h-4 w-4 mr-1' />
            Create Custom
          </Button>
        </div>
        <table className='min-w-full divide-y divide-gray-200'>
          <thead className='bg-gray-50'>
            <tr>
              <th
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
              >
                Package Name
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
              >
                Remarks
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider'
              >
                Price
              </th>
              <th
                scope='col'
                className='px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider'
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody className='bg-white divide-y divide-gray-200'>
            {carePackages.map((carePackage) => (
              <tr key={carePackage.id} className='hover:bg-gray-50'>
                <td className='px-4 py-3'>
                  <div className='font-medium text-gray-900'>{carePackage.care_package_name}</div>
                </td>
                <td className='px-4 py-3'>
                  {carePackage.care_package_remarks && (
                    <div className='text-xs text-gray-500 truncate max-w-md' title={carePackage.care_package_remarks}>
                      {carePackage.care_package_remarks}
                    </div>
                  )}
                </td>
                <td className='px-4 py-3 text-right text-gray-900 font-medium'>
                  ${parseFloat(carePackage.care_package_price).toFixed(2)}
                </td>
                <td className='px-4 py-3 text-center'>
                  <Button
                    type='button'
                    size='sm'
                    onClick={() => handleAddToCart(carePackage)}
                    disabled={addingToCart}
                    className='bg-blue-600 hover:bg-blue-700'
                  >
                    {addingToCart ? (
                      <Loader2 className='h-3 w-3 animate-spin mr-1' />
                    ) : (
                      <ShoppingCart className='h-3 w-3 mr-1' />
                    )}
                    Add
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCreateForm = () => {
    return (
      <form onSubmit={handleCreateSubmit} className='space-y-6'>
        <Card>
          <CardHeader className='pb-3'>
            <div className='flex justify-between items-center'>
              <CardTitle className='flex items-center space-x-2'>
                <Package className='h-5 w-5' />
                <span>Create Custom Package</span>
              </CardTitle>
              <Button type='button' variant='ghost' size='sm' onClick={() => setViewMode('list')}>
                <List className='h-4 w-4 mr-2' />
                Back to List
              </Button>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {/* Configuration like bypass, template select */}
            <div className='flex items-center space-x-2'>
              <Switch id='bypass-package-tab' checked={bypassPackage} onCheckedChange={handleBypassToggle} />
              <Label htmlFor='bypass-package-tab' className='text-sm font-medium text-gray-700'>
                Custom Package (Bypass Template)
              </Label>
            </div>

            <div className='space-y-4'>
              {!bypassPackage && (
                <div className='space-y-1'>
                  <CarePackageSelect
                    label='Select Template'
                    value={selectedPackageId}
                    onSelect={handlePackageSelectForCreate}
                    options={packageOptions}
                  />
                </div>
              )}

              {bypassPackage && (
                <div className='space-y-1'>
                  <Label htmlFor='package_name_custom' className='text-sm font-medium text-gray-700'>
                    Name *
                  </Label>
                  <Input
                    id='package_name_custom'
                    placeholder='Custom package name'
                    value={mainFormData.package_name || ''}
                    onChange={(e) => updateMainField('package_name', e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Services Section reused */}
            <ServicesSection
              mainFormData={mainFormData}
              serviceForm={serviceForm}
              serviceOptions={serviceOptions}
              isLoading={false}
              isCustomizable={isCustomizable}
              bypassPackage={bypassPackage}
              updateServiceFormField={updateServiceFormField}
              selectService={selectService}
              addServiceToPackage={addServiceToPackage}
              removeServiceFromPackage={removeServiceFromPackage}
              updateServiceInPackage={updateServiceInPackage}
              resetServiceForm={resetServiceForm}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className='space-y-4 pt-6'>
            <EmployeeSelect
              name='employee_id'
              label='Created By *'
              value={mainFormData.employee_id}
              onChange={(employeeId) => updateMainField('employee_id', employeeId)}
              options={employeeOptions}
            />

            <div className='space-y-2'>
              <Label htmlFor='package_remarks_custom'>Remarks</Label>
              <Textarea
                id='package_remarks_custom'
                value={mainFormData.package_remarks || ''}
                onChange={(e) => updateMainField('package_remarks', e.target.value)}
                rows={2}
              />
            </div>

            <div className='bg-gray-50 p-4 rounded-lg'>
              <div className='flex justify-between items-center'>
                <span className='font-medium'>Total Amount:</span>
                <span className='text-lg font-bold text-green-600'>
                  ${(mainFormData.package_price || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className='flex justify-end pt-4 gap-2'>
          <Button type='button' variant='outline' onClick={resetMainForm}>
            Reset
          </Button>
          <Button type='submit' disabled={mainFormData.services.length === 0 || !mainFormData.employee_id}>
            <ShoppingCart className='h-4 w-4 mr-2' />
            Add Custom Package to Cart
          </Button>
        </div>
      </form>
    );
  };

  return (
    <div className='flex flex-col h-full space-y-4'>
      {/* Banner */}
      {selectedMember ? (
        <Card className='border-green-200 bg-green-50 flex-shrink-0'>
          <CardContent className='py-2'>
            <p className='text-green-800 text-sm'>
              Adding care packages for: <strong>{selectedMember.name}</strong>
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className='border-blue-200 bg-blue-50 flex-shrink-0'>
          <CardContent className='py-2'>
            <p className='text-blue-800 text-sm'>
              Adding care packages for: <strong>Walk-in customer</strong>
            </p>
          </CardContent>
        </Card>
      )}

      {viewMode === 'list' && (
        <div className='mb-2 relative flex-shrink-0'>
          <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
            <Search className='h-5 w-5 text-gray-400' />
          </div>
          <input
            type='text'
            placeholder='Search care packages by name...'
            value={searchQuery}
            onChange={handleSearchChange}
            className='pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
          />
        </div>
      )}

      <div className='flex-1 overflow-auto px-1'>
        {viewMode === 'list' ? renderCarePackagesList() : renderCreateForm()}
      </div>
    </div>
  );
};

// ============================================================================
// Copied Helper Components
// ============================================================================

const ServicesSection = ({
  mainFormData,
  serviceForm,
  serviceOptions,
  isLoading,
  isCustomizable,
  bypassPackage,
  updateServiceFormField,
  selectService,
  addServiceToPackage,
  removeServiceFromPackage,
  updateServiceInPackage,
  resetServiceForm,
}) => {
  const canModifyServices = bypassPackage || isCustomizable;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <Label className='text-sm font-medium text-gray-700'>Care Package Services</Label>
      </div>

      {canModifyServices && (
        <Card className='border-gray-200'>
          <CardContent className='p-4 space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
              <div className='space-y-1'>
                <Label className='text-sm font-medium text-gray-700'>Service</Label>
                {bypassPackage ? (
                  <div className='pt-2'>
                    <Input
                      placeholder='Enter custom service name'
                      value={serviceForm.name}
                      onChange={(e) => updateServiceFormField('name', e.target.value)}
                      className='h-9'
                    />
                  </div>
                ) : (
                  <ServiceSelect
                    name='service_select'
                    label=''
                    value={serviceForm.id}
                    onChange={() => {}}
                    onSelectFullDetails={selectService}
                    options={serviceOptions}
                    disabled={isLoading}
                  />
                )}
              </div>
              <div className='space-y-3'>
                <Label className='text-sm font-medium text-gray-700'>Quantity</Label>
                <Input
                  type='number'
                  min='1'
                  value={serviceForm.quantity}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      updateServiceFormField('quantity', '');
                    } else {
                      const numValue = parseInt(value) || 0;
                      const validValue = Math.max(1, numValue);
                      updateServiceFormField('quantity', validValue);
                    }
                  }}
                  className='h-9'
                />
              </div>
              <div className='space-y-3'>
                <Label className='text-sm font-medium text-gray-700'>Price</Label>
                <Input
                  type='number'
                  step='0.01'
                  min='0'
                  value={serviceForm.price}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      updateServiceFormField('price', '');
                    } else {
                      const numValue = parseFloat(value) || 0;
                      const validValue = Math.max(0, numValue);
                      updateServiceFormField('price', validValue);
                    }
                  }}
                  className='h-9'
                />
              </div>
              <div className='space-y-3'>
                <Label className='text-sm font-medium text-gray-700'>Discount</Label>
                <Input
                  type='number'
                  step='0.01'
                  min='0'
                  max='1'
                  value={serviceForm.discount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      updateServiceFormField('discount', '');
                    } else {
                      const numValue = parseFloat(value) || 0;
                      const cappedValue = Math.min(1, numValue);
                      updateServiceFormField('discount', cappedValue);
                    }
                  }}
                  className='h-9'
                />
              </div>
            </div>

            <div className='flex justify-between items-center'>
              <div className='text-sm text-gray-600'>Final Price: ${(serviceForm.finalPrice || 0).toFixed(2)}</div>
              <div className='flex space-x-2'>
                <Button
                  type='button'
                  onClick={addServiceToPackage}
                  disabled={!serviceForm.name || (bypassPackage ? false : !serviceForm.id)}
                  size='sm'
                >
                  <Plus className='h-4 w-4 mr-1' />
                  Add Service
                </Button>
                <Button type='button' variant='outline' onClick={resetServiceForm} size='sm'>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mainFormData.services.length > 0 && (
        <div className='space-y-2'>
          {mainFormData.services.map((service, index) => (
            <ServiceRow
              key={index}
              service={service}
              index={index}
              canModify={canModifyServices}
              onUpdate={updateServiceInPackage}
              onRemove={removeServiceFromPackage}
            />
          ))}
        </div>
      )}

      {mainFormData.services.length === 0 && (
        <div className='text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200'>
          <Package className='h-12 w-12 mx-auto mb-2 text-gray-400' />
          <p className='text-sm'>No services added yet</p>
          <p className='text-xs'>
            Add services {canModifyServices ? 'using the form above' : 'by selecting a care package'}
          </p>
        </div>
      )}
    </div>
  );
};

const ServiceRow = ({ service, index, canModify, onUpdate, onRemove }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(service);

  const handleSave = () => {
    onUpdate(index, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(service);
    setIsEditing(false);
  };

  return (
    <div className='p-3 border rounded-lg bg-white space-y-3'>
      <div className='grid grid-cols-1 md:grid-cols-12 gap-4 items-center'>
        <div className='space-y-1 md:col-span-3'>
          <Label className='text-sm font-medium text-gray-700'>Service</Label>
          <div className='text-sm'>{service.name}</div>
        </div>

        <div className='space-y-1 md:col-span-2'>
          <Label className='text-sm font-medium text-gray-700'>Quantity</Label>
          {isEditing && canModify ? (
            <Input
              type='number'
              min='1'
              value={editData.quantity}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setEditData({ ...editData, quantity: '' });
                } else {
                  const numValue = parseInt(value) || 0;
                  const validValue = Math.max(1, numValue);
                  setEditData({ ...editData, quantity: validValue });
                }
              }}
              className='h-8'
            />
          ) : (
            <div className='text-sm'>{service.quantity}</div>
          )}
        </div>

        <div className='space-y-1 md:col-span-2'>
          <Label className='text-sm font-medium text-gray-700'>Discount</Label>
          {isEditing && canModify ? (
            <Input
              type='number'
              step='0.01'
              min='0'
              max='1'
              value={editData.discount}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setEditData({ ...editData, discount: '' });
                } else {
                  const numValue = parseFloat(value) || 0;
                  const cappedValue = Math.min(1, Math.max(0, numValue));
                  setEditData({ ...editData, discount: cappedValue });
                }
              }}
              className='h-8'
            />
          ) : (
            <div className='text-sm'>{service.discount.toFixed(2)}</div>
          )}
        </div>

        <div className='space-y-1 md:col-span-2 xl:col-span-2'>
          <Label className='text-sm font-medium text-gray-700'>Price</Label>
          <div className='text-sm font-medium'>${(service.price || 0).toFixed(2)}</div>
        </div>

        <div
          className={`flex md:col-span-3 xl:col-span-3 ${
            isEditing ? 'flex-col space-y-2 ml-4' : 'space-x-2'
          } justify-end`}
        >
          {canModify && (
            <>
              {isEditing ? (
                <>
                  <Button size='sm' variant='outline' onClick={handleSave} className='w-full md:w-auto'>
                    Save
                  </Button>
                  <Button size='sm' variant='outline' onClick={handleCancel} className='w-full md:w-auto'>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size='sm' variant='outline' onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              )}
              <Button
                size='sm'
                variant='outline'
                onClick={() => onRemove(index)}
                className={`text-red-600 hover:text-red-700 ${isEditing ? 'w-full md:w-auto' : ''}`}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CarePackageTab;
