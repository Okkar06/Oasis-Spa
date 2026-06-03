import axios from 'axios';
import { getBrowserTimezone, transformRequestDates, transformResponseDates } from '@/utils/timezoneUtils';

export const apiClient = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api',
  withCredentials: true,
  // headers: {
  //   'Content-Type': 'application/json',
  // },
});

apiClient.interceptors.request.use(
  (config) => {
    const localDateTime = getBrowserTimezone();

    if (config.data instanceof FormData) {
      // console.log(
      //   '[Interceptor] Request data IS FormData. Headers before sending:',
      //   JSON.parse(JSON.stringify(config.headers))
      // );
    } else if (config.data) {
      // console.log('[Interceptor] Request data is NOT FormData. Applying transformations.');
      const localDateTime = getBrowserTimezone();
      config.data = transformRequestDates(config.data, localDateTime);
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }

    // Note: We don't transform config.params as they are query parameters and shouldn't have timestamps added

    return config;
  },
  (error) => {
    console.error('Request error in interceptor:', error);
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    if (response.data) {
      // console.log('Original response data:', response.data);
      response.data = transformResponseDates(response.data);
      // console.log('Transformed response data:', response.data);
    }
    return response;
  },
  async (error) => {
    if (error.response && error.response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth-error-401'));
    }

    return Promise.reject(error);
  }
);

getBrowserTimezone();

export default apiClient;
