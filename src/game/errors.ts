export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return '';
};

export const errorField = (error: unknown, key: string): unknown =>
  typeof error === 'object' && error !== null ? Reflect.get(error, key) : undefined;
export const errorCode = (error: unknown): string | undefined => {
  const code = errorField(error, 'code');
  return typeof code === 'string' ? code : undefined;
};
export const errorStatus = (error: unknown): number => {
  const status = errorField(error, 'status');
  return typeof status === 'number' ? status : 0;
};
