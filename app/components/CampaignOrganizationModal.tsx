import { useState } from 'react'
import { Check, Folder, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import {
  useCampaignFolders, useCampaignTags, useCreateCampaignFolder, useCreateCampaignTag,
  useDeleteCampaignFolder, useDeleteCampaignTag, useUpdateCampaignFolder,
} from '../hooks/useCampaigns'
import { Button, Modal, btnSecondary, inputClass } from './ui'

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4', '#71717A']

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-zinc-700" style={{ backgroundColor: value }} title="Escolher cor">
    <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
  </label>
}

function FoldersManager() {
  const query = useCampaignFolders(); const create = useCreateCampaignFolder(); const update = useUpdateCampaignFolder(); const remove = useDeleteCampaignFolder()
  const [name, setName] = useState(''); const [color, setColor] = useState(COLORS[0]); const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null); const [deleting, setDeleting] = useState<string | null>(null)
  const submit = () => { if (!name.trim()) return; create.mutate({ name: name.trim(), color }, { onSuccess: () => setName('') }) }
  return <div className="space-y-4">
    <div className="flex items-center gap-2"><ColorPicker value={color} onChange={setColor} /><input className={`${inputClass} flex-1`} placeholder="Nome da pasta" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} /><Button type="button" disabled={!name.trim()} loading={create.isPending} onClick={submit} className="rounded-lg"><Plus size={16} />Criar</Button></div>
    <div className="max-h-64 divide-y divide-zinc-700 overflow-y-auto rounded-lg border border-zinc-700">{query.data?.items.length ? query.data.items.map((folder) => <div key={folder.id} className="flex items-center gap-2 p-3">
      {deleting === folder.id ? <><span className="flex-1 text-sm text-zinc-400">Remover <strong className="text-zinc-200">{folder.name}</strong>?</span><button type="button" className={btnSecondary} onClick={() => setDeleting(null)}>Cancelar</button><Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(folder.id, { onSuccess: () => setDeleting(null) })}>Remover</Button></> : editing?.id === folder.id ? <><ColorPicker value={editing.color} onChange={(next) => setEditing({ ...editing, color: next })} /><input className={`${inputClass} flex-1`} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /><button type="button" aria-label="Salvar pasta" onClick={() => update.mutate(editing, { onSuccess: () => setEditing(null) })} className="p-2 text-emerald-400"><Check size={16} /></button><button type="button" aria-label="Cancelar edição" onClick={() => setEditing(null)} className="p-2 text-zinc-400"><X size={16} /></button></> : <><span className="h-4 w-4 rounded" style={{ backgroundColor: folder.color ?? COLORS[0] }} /><span className="flex-1 truncate text-sm text-zinc-200">{folder.name}</span><span className="text-xs text-zinc-500">({folder.campaign_count})</span><button type="button" aria-label={`Editar ${folder.name}`} onClick={() => setEditing({ id: folder.id, name: folder.name, color: folder.color ?? COLORS[0] })} className="p-2 text-zinc-400"><Pencil size={16} /></button><button type="button" aria-label={`Excluir ${folder.name}`} onClick={() => setDeleting(folder.id)} className="p-2 text-red-400"><Trash2 size={16} /></button></>}
    </div>) : <div className="p-4 text-center text-sm text-zinc-500">Nenhuma pasta criada</div>}</div>
  </div>
}

function TagsManager() {
  const query = useCampaignTags(); const create = useCreateCampaignTag(); const remove = useDeleteCampaignTag()
  const [name, setName] = useState(''); const [color, setColor] = useState(COLORS[1]); const [deleting, setDeleting] = useState<string | null>(null)
  const submit = () => { if (!name.trim()) return; create.mutate({ name: name.trim(), color }, { onSuccess: () => setName('') }) }
  return <div className="space-y-4">
    <div className="flex items-center gap-2"><ColorPicker value={color} onChange={setColor} /><input className={`${inputClass} flex-1`} placeholder="Nome da tag" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} /><Button type="button" disabled={!name.trim()} loading={create.isPending} onClick={submit} className="rounded-lg"><Plus size={16} />Criar</Button></div>
    <div className="max-h-64 divide-y divide-zinc-700 overflow-y-auto rounded-lg border border-zinc-700">{query.data?.items.length ? query.data.items.map((tag) => <div key={tag.id} className="flex items-center gap-2 p-3">{deleting === tag.id ? <><span className="flex-1 text-sm text-zinc-400">Remover <strong className="text-zinc-200">{tag.name}</strong>?</span><button type="button" className={btnSecondary} onClick={() => setDeleting(null)}>Cancelar</button><Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(tag.id, { onSuccess: () => setDeleting(null) })}>Remover</Button></> : <><span className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.color ?? '#71717a' }} /><span className="flex-1 truncate text-sm text-zinc-200">{tag.name}</span><span className="text-xs text-zinc-500">({tag.campaign_count})</span><button type="button" aria-label={`Excluir ${tag.name}`} onClick={() => setDeleting(tag.id)} className="p-2 text-red-400"><Trash2 size={16} /></button></>}</div>) : <div className="p-4 text-center text-sm text-zinc-500">Nenhuma tag criada</div>}</div>
  </div>
}

export function CampaignOrganizationModal({ onClose, initialTab = 'folders' }: { onClose: () => void; initialTab?: 'folders' | 'tags' }) {
  const [tab, setTab] = useState<'folders' | 'tags'>(initialTab)
  return <Modal titleId="campaign-organization-title" onClose={onClose} panelClassName="max-w-lg">
    <div className="flex items-center justify-between"><h2 id="campaign-organization-title" className="text-lg font-semibold text-white">Organizar Campanhas</h2><button type="button" aria-label="Fechar" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-800"><X size={18} /></button></div>
    <div className="mt-5 grid grid-cols-2 rounded-lg bg-zinc-800 p-1"><button type="button" onClick={() => setTab('folders')} className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm ${tab === 'folders' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}><Folder size={16} />Pastas</button><button type="button" onClick={() => setTab('tags')} className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm ${tab === 'tags' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}><Tags size={16} />Tags</button></div>
    <div className="mt-4">{tab === 'folders' ? <FoldersManager /> : <TagsManager />}</div>
  </Modal>
}
