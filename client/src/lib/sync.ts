import { QueryClient } from '@tanstack/react-query';

export const invalidateAllTimeQueries = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['timeStatus'] });
  queryClient.invalidateQueries({ queryKey: ['timesheetsHistory'] });
  queryClient.invalidateQueries({ queryKey: ['workEvidence'] });
  queryClient.invalidateQueries({ queryKey: ['correctionsList'] });
  queryClient.invalidateQueries({ queryKey: ['managementTimesheets'] });
  queryClient.invalidateQueries({ queryKey: ['projectsList'] });
  queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
  queryClient.invalidateQueries({ queryKey: ['employeeDirectory'] });
};