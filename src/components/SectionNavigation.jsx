import { Box, Tab, Tabs } from '@mui/material';
import { useId } from 'react';

export default function SectionNavigation({ value, sections, onChange, label = 'Group sections', disabled = false, idPrefix }) {
  const id = useId();
  return <Box component="nav" sx={{ mb: 3 }}>
    <Tabs value={value} onChange={(_, next) => onChange?.(next)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={label}>
      {sections.map(section => <Tab key={section.id} id={`${idPrefix ?? id}-tab-${section.id}`} aria-controls={idPrefix ? `${idPrefix}-section-${section.id}` : undefined} value={section.id} label={section.label}
        disabled={disabled} {...(section.href ? { component: 'a', href: section.href } : {})} />)}
    </Tabs>
  </Box>;
}
