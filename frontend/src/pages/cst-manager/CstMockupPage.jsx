import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import MockupRequesterPanel from '../../components/mockup/MockupRequesterPanel.jsx';

export default function CstMockupPage() {
  return (
    <CstManagerShell title="Mockup">
      <MockupRequesterPanel />
    </CstManagerShell>
  );
}
