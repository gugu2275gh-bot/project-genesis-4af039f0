import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle, User, MapPin, FileText, AlertCircle } from 'lucide-react';

const CIVIL_STATUS_OPTIONS = [
  { value: 'SOLTEIRO', label: 'Solteiro(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
  { value: 'DIVORCIADO', label: 'Divorciado(a)' },
  { value: 'VIUVO', label: 'Viúvo(a)' },
  { value: 'UNIAO_ESTAVEL', label: 'União Estável' },
];

const EDUCATION_LEVELS = [
  { value: 'FUNDAMENTAL', label: 'Ensino Fundamental' },
  { value: 'MEDIO', label: 'Ensino Médio' },
  { value: 'TECNICO', label: 'Ensino Técnico' },
  { value: 'SUPERIOR', label: 'Ensino Superior' },
  { value: 'POS_GRADUACAO', label: 'Pós-Graduação' },
  { value: 'MESTRADO', label: 'Mestrado' },
  { value: 'DOUTORADO', label: 'Doutorado' },
];

interface OnboardingData {
  civil_status: string;
  profession: string;
  father_name: string;
  mother_name: string;
  empadronamiento_address: string;
  cpf: string;
  eu_entry_last_6_months: boolean | null;
  previous_official_relationship: boolean | null;
  expulsion_history: boolean | null;
  education_level: string;
  spain_arrival_date: string;
  document_type: string;
  document_number: string;
  address: string;
  referral_confirmed: boolean | null;
}

export default function PortalOnboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [hasReferral, setHasReferral] = useState(false);
  
  const [formData, setFormData] = useState<OnboardingData>({
    civil_status: '',
    profession: '',
    father_name: '',
    mother_name: '',
    empadronamiento_address: '',
    cpf: '',
    eu_entry_last_6_months: null,
    previous_official_relationship: null,
    expulsion_history: null,
    education_level: '',
    spain_arrival_date: '',
    document_type: '',
    document_number: '',
    address: '',
    referral_confirmed: null,
  });

  useEffect(() => {
    async function fetchContactData() {
      if (!user) return;
      
      // Buscar o contato vinculado ao usuário através do service_case
      const { data: serviceCase } = await supabase
        .from('service_cases')
        .select(`
          opportunity_id,
          opportunities (
            leads (
              contact_id,
              contacts (
                id,
                referral_name,
                onboarding_completed
              )
            )
          )
        `)
        .eq('client_user_id', user.id)
        .maybeSingle();
      
      if (serviceCase?.opportunities?.leads?.contacts) {
        const contact = serviceCase.opportunities.leads.contacts;
        setContactId(contact.id);
        setHasReferral(!!contact.referral_name);
        
        if (contact.onboarding_completed) {
          navigate('/portal');
        }
      }
    }
    
    fetchContactData();
  }, [user, navigate]);

  const totalSteps = hasReferral ? 4 : 3;
  const progress = (step / totalSteps) * 100;

  const handleInputChange = (field: keyof OnboardingData, value: string | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateStep = (stepNumber: number): boolean => {
    switch (stepNumber) {
      case 1:
        return !!(formData.civil_status && formData.profession && formData.father_name && formData.mother_name);
      case 2:
        return !!(formData.document_type && formData.document_number && formData.address);
      case 3:
        return formData.eu_entry_last_6_months !== null && 
               formData.previous_official_relationship !== null && 
               formData.expulsion_history !== null;
      case 4:
        return formData.referral_confirmed !== null;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateStep(step)) {
      if (step < totalSteps) {
        setStep(step + 1);
      } else {
        handleSubmit();
      }
    } else {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, preencha todos os campos obrigatórios antes de continuar.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!contactId) {
      toast({
        title: 'Erro',
        description: 'Não foi possível identificar seu cadastro. Entre em contato com o suporte.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({
          ...formData,
          onboarding_completed: true,
        })
        .eq('id', contactId);

      if (error) throw error;

      toast({
        title: 'Cadastro concluído!',
        description: 'Seus dados foram salvos com sucesso. Bem-vindo ao portal!',
      });

      navigate('/portal');
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Complete seu Cadastro</CardTitle>
          <CardDescription>
            Para iniciar seu processo, precisamos de algumas informações adicionais.
          </CardDescription>
          <div className="mt-4">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2">
              Passo {step} de {totalSteps}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Dados Pessoais */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Dados Pessoais</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Estado Civil *</Label>
                  <Select 
                    value={formData.civil_status} 
                    onValueChange={(v) => handleInputChange('civil_status', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CIVIL_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Profissão *</Label>
                  <Input
                    value={formData.profession}
                    onChange={(e) => handleInputChange('profession', e.target.value)}
                    placeholder="Sua profissão"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Pai *</Label>
                  <Input
                    value={formData.father_name}
                    onChange={(e) => handleInputChange('father_name', e.target.value)}
                    placeholder="Nome completo do pai"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Nome da Mãe *</Label>
                  <Input
                    value={formData.mother_name}
                    onChange={(e) => handleInputChange('mother_name', e.target.value)}
                    placeholder="Nome completo da mãe"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nível de Escolaridade</Label>
                  <Select 
                    value={formData.education_level} 
                    onValueChange={(v) => handleInputChange('education_level', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {EDUCATION_LEVELS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>CPF (para brasileiros)</Label>
                  <Input
                    value={formData.cpf}
                    onChange={(e) => handleInputChange('cpf', e.target.value)}
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Documentos e Endereço */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Documentos e Endereço</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Documento *</Label>
                  <Select 
                    value={formData.document_type} 
                    onValueChange={(v) => handleInputChange('document_type', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PASSAPORTE">Passaporte</SelectItem>
                      <SelectItem value="NIE">NIE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Número do Documento *</Label>
                  <Input
                    value={formData.document_number}
                    onChange={(e) => handleInputChange('document_number', e.target.value)}
                    placeholder="Número"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Data de Chegada na Espanha</Label>
                <Input
                  type="date"
                  value={formData.spain_arrival_date}
                  onChange={(e) => handleInputChange('spain_arrival_date', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Endereço Atual *</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Endereço completo na Espanha"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Endereço de Empadronamiento</Label>
                <Textarea
                  value={formData.empadronamiento_address}
                  onChange={(e) => handleInputChange('empadronamiento_address', e.target.value)}
                  placeholder="Se diferente do endereço atual"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Step 3: Histórico Legal */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Histórico na Europa</h3>
              </div>

              <div className="space-y-4">
                <div className="p-4 border rounded-lg space-y-3">
                  <Label>Você entrou na União Europeia nos últimos 6 meses? *</Label>
                  <RadioGroup
                    value={formData.eu_entry_last_6_months === null ? '' : String(formData.eu_entry_last_6_months)}
                    onValueChange={(v) => handleInputChange('eu_entry_last_6_months', v === 'true')}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="true" id="eu_yes" />
                      <Label htmlFor="eu_yes">Sim</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="false" id="eu_no" />
                      <Label htmlFor="eu_no">Não</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="p-4 border rounded-lg space-y-3">
                  <Label>Você já teve alguma relação oficial com a Espanha? *</Label>
                  <p className="text-sm text-muted-foreground">(NIE, residência anterior, etc.)</p>
                  <RadioGroup
                    value={formData.previous_official_relationship === null ? '' : String(formData.previous_official_relationship)}
                    onValueChange={(v) => handleInputChange('previous_official_relationship', v === 'true')}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="true" id="rel_yes" />
                      <Label htmlFor="rel_yes">Sim</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="false" id="rel_no" />
                      <Label htmlFor="rel_no">Não</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="p-4 border rounded-lg space-y-3 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <Label>Você já foi expulso ou deportado de algum país? *</Label>
                  </div>
                  <RadioGroup
                    value={formData.expulsion_history === null ? '' : String(formData.expulsion_history)}
                    onValueChange={(v) => handleInputChange('expulsion_history', v === 'true')}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="true" id="exp_yes" />
                      <Label htmlFor="exp_yes">Sim</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="false" id="exp_no" />
                      <Label htmlFor="exp_no">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Confirmação de Indicação */}
          {step === 4 && hasReferral && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Confirmação de Indicação</h3>
              </div>

              <div className="p-6 border rounded-lg space-y-4 bg-muted/50">
                <p className="text-center">
                  Nossos registros indicam que você foi indicado por um colaborador parceiro.
                </p>
                <p className="text-center font-medium">
                  Você utilizou o serviço indicado por este colaborador?
                </p>
                
                <RadioGroup
                  value={formData.referral_confirmed === null ? '' : String(formData.referral_confirmed)}
                  onValueChange={(v) => handleInputChange('referral_confirmed', v === 'true')}
                  className="flex justify-center gap-8 pt-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="true" id="ref_yes" />
                    <Label htmlFor="ref_yes" className="text-lg">Sim, utilizei</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="false" id="ref_no" />
                    <Label htmlFor="ref_no" className="text-lg">Não utilizei</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
            >
              Voltar
            </Button>
            
            <Button onClick={handleNext} disabled={isSubmitting}>
              {step === totalSteps ? (
                isSubmitting ? 'Salvando...' : 'Concluir Cadastro'
              ) : (
                'Próximo'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
