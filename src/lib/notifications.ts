import { supabase } from '@/integrations/supabase/client';

export type NotificationType = 
  | 'task_assigned'
  | 'task_due'
  | 'document_uploaded'
  | 'document_approved'
  | 'document_rejected'
  | 'payment_confirmed'
  | 'payment_pending'
  | 'contract_signed'
  | 'lead_new'
  | 'case_status_changed'
  | 'requirement_new'
  | 'sla_warning'
  | 'general';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
}

export async function createNotification({ userId, type, title, message }: CreateNotificationParams) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      is_read: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating notification:', error);
    return null;
  }

  return data;
}

export async function createMultipleNotifications(notifications: CreateNotificationParams[]) {
  const { data, error } = await supabase
    .from('notifications')
    .insert(
      notifications.map(n => ({
        user_id: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        is_read: false,
      }))
    )
    .select();

  if (error) {
    console.error('Error creating notifications:', error);
    return [];
  }

  return data;
}

// Notification templates for common scenarios
export const notificationTemplates = {
  taskAssigned: (taskTitle: string) => ({
    type: 'task_assigned' as NotificationType,
    title: 'Nova tarefa atribuída',
    message: `Você foi atribuído à tarefa: ${taskTitle}`,
  }),
  
  taskDue: (taskTitle: string, dueDate: string) => ({
    type: 'task_due' as NotificationType,
    title: 'Tarefa próxima do prazo',
    message: `A tarefa "${taskTitle}" vence em ${dueDate}`,
  }),
  
  documentUploaded: (docName: string, clientName: string) => ({
    type: 'document_uploaded' as NotificationType,
    title: 'Novo documento enviado',
    message: `${clientName} enviou o documento: ${docName}`,
  }),
  
  documentApproved: (docName: string) => ({
    type: 'document_approved' as NotificationType,
    title: 'Documento aprovado',
    message: `O documento "${docName}" foi aprovado`,
  }),
  
  documentRejected: (docName: string, reason: string) => ({
    type: 'document_rejected' as NotificationType,
    title: 'Documento rejeitado',
    message: `O documento "${docName}" foi rejeitado: ${reason}`,
  }),
  
  paymentConfirmed: (amount: number, currency: string) => ({
    type: 'payment_confirmed' as NotificationType,
    title: 'Pagamento confirmado',
    message: `Pagamento de ${currency} ${amount.toFixed(2)} confirmado`,
  }),
  
  paymentPending: (clientName: string, amount: number) => ({
    type: 'payment_pending' as NotificationType,
    title: 'Pagamento pendente',
    message: `Aguardando pagamento de ${clientName}: €${amount.toFixed(2)}`,
  }),
  
  contractSigned: (clientName: string) => ({
    type: 'contract_signed' as NotificationType,
    title: 'Contrato assinado',
    message: `${clientName} assinou o contrato`,
  }),
  
  newLead: (leadName: string, service: string) => ({
    type: 'lead_new' as NotificationType,
    title: 'Novo lead',
    message: `${leadName} demonstrou interesse em ${service}`,
  }),
  
  caseStatusChanged: (caseType: string, newStatus: string) => ({
    type: 'case_status_changed' as NotificationType,
    title: 'Status do caso atualizado',
    message: `${caseType}: ${newStatus}`,
  }),
  
  requirementReceived: (description: string) => ({
    type: 'requirement_new' as NotificationType,
    title: 'Nova exigência recebida',
    message: description.substring(0, 100) + (description.length > 100 ? '...' : ''),
  }),
  
  slaWarning: (entityType: string, entityName: string) => ({
    type: 'sla_warning' as NotificationType,
    title: 'Alerta de SLA',
    message: `${entityType} "${entityName}" próximo do prazo de SLA`,
  }),
};
