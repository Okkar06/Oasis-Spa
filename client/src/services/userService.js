import apiClient from './api';

// User Profile API functions
export const userService = {
  // Get current user profile
  getCurrentUserProfile: async () => {
    const response = await apiClient.get('/auth/profile');
    return response.data.data;
  },

  // Update user profile (including language preference)
  updateUserProfile: async (userId, userData) => {
    const response = await apiClient.put(`/auth/user/${userId}`, userData);
    return response.data;
  },

  // Get user by ID (for admin purposes)
  getUserById: async (userId) => {
    const response = await apiClient.get(`/auth/user/${userId}`);
    return response.data;
  },

  // Get all users (for admin purposes)
  getUsers: async (params = {}) => {
    const response = await apiClient.get('/auth/users', { params });
    return response.data;
  },
};

export default userService;