export const normalizeName = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim().replace(/\s+/g, ' ');
