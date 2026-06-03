import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CreditCard, ShoppingCart } from 'lucide-react';
import EmployeeSelect from '@/components/ui/forms/EmployeeSelect';
import useTransactionCartStore from '@/stores/useTransactionCartStore';

const TopUpTab = () => {
  const { selectedMember, addCartItem } = useTransactionCartStore();
  const [amount, setAmount] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [remarks, setRemarks] = useState('');

  const handleAddToCart = (e) => {
    e.preventDefault();

    if (!selectedMember) {
      alert('Please select a member first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!employeeId) {
      alert('Please select an employee');
      return;
    }

    addCartItem({
      id: crypto.randomUUID(),
      type: 'top_up',
      data: {
        name: 'Stored Value Top Up',
        price: parseFloat(amount),
        amount: parseFloat(amount), // Redundant but explicit
        employee_id: employeeId,
        remarks: remarks,
        member_id: selectedMember.id,
      },
    });

    // Reset form
    setAmount('');
    setRemarks('');
    // Keep employeeId for convenience if doing multiple? No, maybe reset.
    // setEmployeeId('');
    alert('Top up added to cart');
  };

  if (!selectedMember) {
    return (
      <div className='p-8 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200'>
        <CreditCard className='h-12 w-12 mx-auto mb-2 text-gray-400' />
        <h3 className='text-lg font-medium text-gray-900'>Member Selection Required</h3>
        <p>Please select a member to top up their card value.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center space-x-2'>
          <CreditCard className='h-5 w-5' />
          <span>Top Up Card Value</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAddToCart} className='space-y-6 w-full'>
          <div className='p-4 bg-blue-50 border border-blue-100 text-blue-800 rounded-md'>
            <div className='font-medium'>Top Up for: {selectedMember.name}</div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='topup-amount'>Top Up Amount ($) *</Label>
            <div className='relative'>
              <span className='absolute left-3 top-2.5 text-gray-500'>$</span>
              <Input
                id='topup-amount'
                type='number'
                min='0.01'
                step='0.01'
                placeholder='0.00'
                className='pl-7'
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <EmployeeSelect name='employee_id' label='Salesperson *' value={employeeId} onChange={setEmployeeId} />

          <div className='space-y-2'>
            <Label htmlFor='topup-remarks'>Remarks</Label>
            <Textarea
              id='topup-remarks'
              placeholder='Optional remarks'
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
          </div>

          <Button type='submit' className='w-full' disabled={!amount || !employeeId}>
            <ShoppingCart className='mr-2 h-4 w-4' />
            Add to Cart
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default TopUpTab;
