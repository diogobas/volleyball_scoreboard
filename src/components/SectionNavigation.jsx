import { Box, Tab, Tabs } from '@mui/material';
import { useId } from 'react';

export default function SectionNavigation({ value, sections, onChange, label = 'Group sections', disabled = false, idPrefix, orientation = 'horizontal', sticky = false }) {
  const id = useId();
  const vertical = orientation === 'vertical';
  return <Box component="nav" sx={{ mb: vertical || sticky ? 0 : 3, ...(sticky ? {
    position: 'sticky', top: 0, zIndex: theme => theme.zIndex.appBar,
    bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider',
  } : {}) }}>
    <Tabs value={value} onChange={(_, next) => onChange?.(next)} orientation={orientation} variant="scrollable" scrollButtons={vertical ? false : 'auto'} allowScrollButtonsMobile aria-label={label}
      sx={vertical ? {
        '& .MuiTabs-indicator': { left: 0, right: 'auto', width: 3, borderRadius: 1 },
        '& .MuiTab-root': { alignItems: 'flex-start', textAlign: 'left', borderRadius: 1, px: 2, minHeight: 48 },
        '& .Mui-selected': { bgcolor: 'action.selected' },
      } : undefined}>
      {sections.map(section => <Tab key={section.id} id={`${idPrefix ?? id}-tab-${section.id}`} aria-controls={idPrefix ? `${idPrefix}-section-${section.id}` : undefined} value={section.id} label={section.label}
        disabled={disabled} {...(section.href ? { component: 'a', href: section.href } : {})} />)}
    </Tabs>
  </Box>;
}
