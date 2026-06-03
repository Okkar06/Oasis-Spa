import React, { useState, useEffect } from "react";
import { useForm, FormProvider } from 'react-hook-form';
import { useNavigate } from "react-router-dom";
import { Button } from '@/components/ui/button';
import api from '@/services/api';
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from '@/components/ui/switch';
import DatePicker from "@/components/date-picker";
import { AppSidebar } from '@/components/app-sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import EmployeeSelect from '@/components/ui/forms/EmployeeSelect';
import { useAuth } from "@/context/AuthContext";

export default function CreateProduct() {
  //Role-based access
  const { user } = useAuth();
  const allowedRoles = ['super_admin', 'data_admin'];

  // Modal to show success or error message
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // loading state for form submission
  const [loading, setLoading] = useState(false);

  // get categories for dropdown
  const [categories, setCategories] = useState([]);

  // For EmployeeSelect
  const methods = useForm();
  const { watch, reset, register, formState: { errors }, setValue } = methods;

  // For form data
  const [formData, setFormData] = useState({
    product_name: "",
    product_description: "",
    product_remarks: "",
    product_unit_sale_price: "",
    product_unit_cost_price: "",
    product_is_enabled: true,
    product_category_id: "",
    created_at: null,
    created_by: ""
  });
  const [product, setProduct] = useState();

  const [selectedCategory, setSelectedCategory] = useState(formData.product_category_id);
  const [createdAt, setCreatedAt] = useState(null);
  const createdBy = watch('created_by');
  const [selectedStatus, setSelectedStatus] = useState(formData.product_is_enabled)

  const navigate = useNavigate();

  const getCategories = async () => {
    try {
      const response = await api.get('/product/product-cat');
      if (response.status === 200) {
        setCategories(response.data);
      } else {
        console.error('Failed to fetch product categories:', response.statusText);
      }
    } catch (err) {
      console.error('Error fetching product categories:', err);
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  // react-hook-form will call this with the form values (not an event)
  const onSubmitHandler = async (values) => {
    setLoading(true);
    try {
      // Build submit payload from the validated form values
      const submitData = {
        ...values,
        created_at: values.created_at instanceof Date ? values.created_at.toISOString() : values.created_at,
      };

      console.log('Submitting product:', submitData);
      const response = await api.post(`/product/create-product`, submitData, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (response.status === 201) {
        setErrorMsg("");
        setProduct(response.data.product);
        setFormData({
          product_name: "",
          product_description: "",
          product_remarks: "",
          product_unit_selling_price: "",
          product_unit_cost_price: "",
          product_is_enabled: true,
          product_category_id: "",
          created_at: null,
          created_by: ""
        });
        setCreatedAt(null);
        setSelectedCategory("");
        setSelectedStatus(true);
        reset();
      }
    } catch (err) {
      console.error('Error creating product:' + err);
      setErrorMsg(err?.response?.data?.message || 'Create failed');
    } finally {
      setLoading(false);
      setModalOpen(true);
    }
  };

  useEffect(() => {
    try {
      getCategories();
    } catch (err) {
      console.error('Error fetching data:' + err);
    }
  }, [])

  // Redirect to 404 page if user does not have the right role
  useEffect(() => {
    if (!user || !allowedRoles.includes(user.role)) {
      navigate('*'); 
    }
  }, [user, navigate]);

  useEffect(() => {
    try {
      setFormData(prevFormData => ({
        ...prevFormData,
        product_category_id: selectedCategory,
        created_by: createdBy || "",
        created_at: new Date(createdAt),
        product_is_enabled: selectedStatus
      }));
    } catch (err) {
      console.error('Error updating form data:', err);
    }
  }, [selectedCategory, createdBy, createdAt, selectedStatus]);

  return (
    <div className='[--header-height:calc(theme(spacing.14))]'>
      <SidebarProvider className='flex flex-col'>
        <SiteHeader />
        <div className='flex flex-1'>
          <AppSidebar />
          <SidebarInset>
            <div className='flex flex-1 flex-col gap-4 p-3'>

              {/* modal */}
              {modalOpen && (
                <div className="fixed inset-0 flex justify-center items-center bg-opacity-80 z-50">
                  <div className="bg-white border p-6 rounded-md shadow-lg w-full max-w-lg">
                    <div className="flex justify-between items-center">
                      {errorMsg ? (
                        <h3 className="text-xl font-semibold">Error</h3>
                      ) :
                        (
                          <h3 className="text-xl font-semibold">Create Product Page</h3>
                        )}
                      <button
                        onClick={() => { setModalOpen(false); setProduct(null) }}
                        className="text-xl"
                        aria-label="Close"
                      >
                        X
                      </button>
                    </div>
                    <div className="mt-4">
                      {errorMsg ? (
                        <p className="text-xl text-red-500">{errorMsg}</p>
                      ) : (
                        <>
                          <p className="text-xl text-green-600">Product was created successfully!</p>
                          <p>ID: {product.id}</p>
                          <p>Name: {product.product_name}</p>
                          <p>Category: {
                            categories.find(cat => cat.id === product.product_category_id)?.product_category_name || 'Other'
                          }</p>
                        </>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      {errorMsg ? "" : (
                        <Button
                          onClick={() => { navigate('/manage-product'); setProduct(null) }}
                          className="bg-blue-600 rounded-md hover:bg-blue-500"
                        >
                          View Products
                        </Button>
                      )}
                      <Button
                        onClick={() => { setModalOpen(false); setProduct(null) }}
                        className="text-white py-2 px-4 rounded-md hover:bg-gray-700"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <Card className={"w-full px-4"}>
                {loading ? (
                  <CardContent>
                    <div className="flex justify-center items-center h-full">
                      <span className="text-xl text-gray-500">Loading...</span>
                    </div>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader>
                      <CardTitle><h2 className="text-2xl font-bold">Create a Product</h2></CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FormProvider {...methods}>
                        <form onSubmit={methods.handleSubmit(onSubmitHandler)} className="space-y-3">
                          <div className="grid auto-rows-min gap-3 lg:grid-cols-2">
                            {/* Date of Creation */}
                            <div>
                              <label htmlFor="created_at" className="block text-md font-medium">Date of Creation*</label>
                              <input
                                id="created_at"
                                type="date"
                                className="w-[250px] p-2 border rounded-md"
                                {...register('created_at', { required: 'Date of Creation is required' })}
                              />
                              {errors.created_at && <p className="text-red-500 text-xs">{errors.created_at.message}</p>}
                            </div>

                            {/* Created By */}
                            <div>
                              <label htmlFor="created_by" className="block text-md font-medium">Created By*</label>
                              <EmployeeSelect name='created_by' label='' rules={{ required: 'Created By is required' }} inputId="created_by" />
                              {errors.created_by && <p className="text-red-500 text-xs">{errors.created_by.message}</p>}
                            </div>

                            {/* Product Name */}
                            <div>
                              <label htmlFor="product_name" className="block text-md font-medium">Product Name*</label>
                              <input
                                id="product_name"
                                type="text"
                                className="w-[250px] p-2 border rounded-md"
                                placeholder="Enter product name"
                                {...register('product_name', { required: 'Product Name is required' })}
                              />
                              {errors.product_name && <p className="text-red-500 text-xs">{errors.product_name.message}</p>}
                            </div>

                            {/* Unit Cost Price */}
                            <div>
                              <label htmlFor="product_unit_cost_price" className="block text-md font-medium">Unit Cost Price*</label>
                              <input
                                id="product_unit_cost_price"
                                type="number"
                                className="w-40 px-2 py-1 border rounded-md"
                                placeholder="100"
                                {...register('product_unit_cost_price', { required: 'Unit Cost Price is required' })}
                              /> SGD
                              {errors.product_unit_cost_price && <p className="text-red-500 text-xs">{errors.product_unit_cost_price.message}</p>}
                            </div>

                            {/* Product Category */}
                            <div>
                              <label htmlFor="product_category_id" className="block text-md font-medium">Product Category*</label>
                              <select
                                id="product_category_id"
                                className="w-[250px] p-2 border rounded-md"
                                {...register('product_category_id', { required: 'Product Category is required' })}
                              >
                                <option value="">Select Category</option>
                                {categories.map((category) => (
                                  <option key={category.id} value={category.id}>{category.product_category_name}</option>
                                ))}
                              </select>
                              {errors.product_category_id && <p className="text-red-500 text-xs">{errors.product_category_id.message}</p>}
                            </div>

                            {/* Unit Selling Price */}
                            <div>
                              <label htmlFor="product_unit_sale_price" className="block text-md font-medium">Unit Sale Price*</label>
                              <input
                                id="product_unit_sale_price"
                                type="number"
                                className="w-40 px-2 py-1 border rounded-md"
                                placeholder="100"
                                {...register('product_unit_sale_price', { required: 'Unit Sale Price is required' })}
                              /> SGD
                              {errors.product_unit_sale_price && <p className="text-red-500 text-xs">{errors.product_unit_sale_price.message}</p>}
                            </div>

                            {/* Status */}
                            <div className="flex my-2 space-x-3">
                              <label className="block text-md font-medium ">Enabled</label>
                              <Switch checked={selectedStatus} onCheckedChange={setSelectedStatus} required />
                            </div>

                          </div>

                          {/* Product Description */}
                          <div>
                            <label htmlFor="product_description" className="block text-md font-medium">Product Description</label>
                            <textarea
                              id="product_description"
                              className="w-full p-2 border rounded-md"
                              placeholder="Enter product description"
                              {...register('product_description')}
                            />
                          </div>

                          {/* Remarks */}
                          <div>
                            <label htmlFor="product_remarks" className="block text-md font-medium ">Remarks</label>
                            <textarea
                              id="product_remarks"
                              className="w-full p-2 border rounded-md"
                              placeholder="Enter remarks"
                              {...register('product_remarks')}
                            />
                          </div>

                          {/* Submit Button */}
                          <div className="flex justify-center space-x-4">
                            <Button type="submit" className="bg-blue-600 rounded-md hover:bg-blue-500">
                              Create Product
                            </Button>
                            <Button onClick={() => navigate(-1)} className="rounded-md hover:bg-gray-500">
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </FormProvider>
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
