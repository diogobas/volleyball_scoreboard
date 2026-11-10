export const normalizeName = (name) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim().replace(/\s+/g, ' ');
