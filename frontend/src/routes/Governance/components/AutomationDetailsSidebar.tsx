/* Copyright Contributors to the Open Cluster Management project */
import {
  Button,
  ButtonVariant,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Icon,
  Stack,
  Text,
} from '@patternfly/react-core'
import { CheckCircleIcon, ExclamationCircleIcon, ExclamationTriangleIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'
import { generatePath, useNavigate } from 'react-router-dom-v5-compat'
import { AutomationProviderHint } from '../../../components/AutomationProviderHint'
import { BulkActionModal, BulkActionModalProps } from '../../../components/BulkActionModal'
import { Trans, useTranslation } from '../../../lib/acm-i18next'
import { NavigationPath } from '../../../NavigationPath'
import { AnsibleJob, Policy, PolicyAutomation, Secret } from '../../../resources'
import { deleteResource } from '../../../resources/utils'
import { useRecoilValue, useSharedAtoms } from '../../../shared-recoil'
import { AcmEmptyState, AcmTable } from '../../../ui-components'
import { ClusterPolicyViolationIcons } from '../components/ClusterPolicyViolations'
import { useGovernanceData } from '../useGovernanceData'
import AcmTimestamp from '../../../lib/AcmTimestamp'

export interface JobTableData {
  name: string
  namespace: string
  status: string
  started: string | undefined
  finished: string | undefined
}

export function AutomationDetailsSidebar(props: {
  setModal: (modal: React.ReactNode) => void
  policyAutomationMatch: PolicyAutomation
  policy: Policy
  onClose: () => void
}) {
  const { policyAutomationMatch, policy, onClose } = props
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { ansibleJobState, secretsState } = useSharedAtoms()
  const ansibleJobs = useRecoilValue(ansibleJobState)
  const secrets = useRecoilValue(secretsState)
  const govData = useGovernanceData([policy])
  const clusterRiskScore =
    govData.clusterRisks.high +
    govData.clusterRisks.medium +
    govData.clusterRisks.low +
    govData.clusterRisks.unknown +
    govData.clusterRisks.synced

  const [modalProps, setModalProps] = useState<BulkActionModalProps<PolicyAutomation> | { open: false }>({
    open: false,
  })

  const credential = useMemo(
    () =>
      secrets.filter(
        (secret: Secret) =>
          secret.metadata.labels?.['cluster.open-cluster-management.io/type'] === 'ans' &&
          secret.metadata.name === policyAutomationMatch.spec.automationDef.secret
      ),
    [policyAutomationMatch, secrets]
  )

  const towerURL = useMemo(
    () => (credential[0] ? Buffer.from(credential[0]?.data!.host, 'base64').toString('ascii') : '-'),
    [credential]
  )

  const jobItems = useMemo(
    () =>
      ansibleJobs
        .filter((job: AnsibleJob) => {
          const {
            metadata: { ownerReferences },
          } = job
          if (!ownerReferences) {
            return false
          }
          const matched = ownerReferences.find(
            (or) =>
              or.apiVersion === 'policy.open-cluster-management.io/v1beta1' &&
              or.kind === 'PolicyAutomation' &&
              or.name === policyAutomationMatch.metadata.name
          )
          return matched !== undefined
        })
        .map((job: AnsibleJob) => {
          const jobResult = job.status?.ansibleJobResult
          const conditions = job.status?.conditions
          const ansibleResultCondition = conditions?.find((arc) => arc.ansibleResult)
          return {
            name: job.metadata.name!,
            namespace: job.metadata.namespace!,
            status: jobResult?.status ?? 'No status',
            started: jobResult?.started ?? ansibleResultCondition?.lastTransitionTime,
            finished: jobResult?.finished ?? ansibleResultCondition?.lastTransitionTime,
          }
        }),
    [ansibleJobs, policyAutomationMatch.metadata.name]
  )

  const jobCols = useMemo(
    () => [
      {
        header: 'Status',
        cell: (item: JobTableData) => {
          let ansibleJobStatus = item.status
          ansibleJobStatus =
            ansibleJobStatus && typeof ansibleJobStatus === 'string' ? ansibleJobStatus.trim().toLowerCase() : '-'
          switch (ansibleJobStatus) {
            case 'successful':
              return (
                <div>
                  <Icon status="success">
                    <CheckCircleIcon />
                  </Icon>{' '}
                  {t('Successful')}
                </div>
              )
            case 'error':
            case 'failed':
              return (
                <div>
                  <Icon status="danger">
                    <ExclamationCircleIcon />
                  </Icon>{' '}
                  {t('Failed')}
                </div>
              )
            case '-':
            default:
              return (
                <div>
                  <Icon status="warning">
                    <ExclamationTriangleIcon />
                  </Icon>{' '}
                  {t('No status')}
                </div>
              )
          }
        },
        sort: 'status',
      },
      {
        header: 'Started',
        cell: (item: JobTableData) => <AcmTimestamp timestamp={item.started} />,
        sort: 'started',
      },
      {
        header: 'Finished',
        cell: (item: JobTableData) => <AcmTimestamp timestamp={item.finished} />,
        sort: 'finished',
      },
      {
        header: '',
        cell: (item: JobTableData) => (
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`${NavigationPath.search}?filters={%22textsearch%22:%22cluster%3Alocal-cluster%20kind%3AAnsibleJob%20namespace%3A${item.namespace}%20name%3A${item.name}%22}`}
          >
            {'View job'}
          </a>
        ),
      },
    ],
    [t]
  )

  return (
    <div>
      <BulkActionModal<PolicyAutomation> {...modalProps} />
      <AutomationProviderHint component="alert" policyAutomation />
      <Stack hasGutter>
        <DescriptionList>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Policy name')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>{policyAutomationMatch.spec.policyRef}</DescriptionListDescription>
          </DescriptionListGroup>

          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Cluster violations')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              {clusterRiskScore > 0 ? (
                <ClusterPolicyViolationIcons risks={govData.clusterRisks} />
              ) : (
                <div>
                  <ExclamationTriangleIcon color="var(--pf-v5-global--warning-color--100)" /> {'No status'}
                </div>
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>

          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Policy automation mode')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>{policyAutomationMatch.spec.mode}</DescriptionListDescription>
          </DescriptionListGroup>

          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Ansible tower URL')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <Button isInline variant={ButtonVariant.link} onClick={() => window.open(towerURL)}>
                {towerURL}
              </Button>
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </Stack>
      <AcmTable<JobTableData>
        key="ansible-job-history"
        items={jobItems}
        emptyState={<AcmEmptyState title="No Ansible jobs found" message="You do not have any Ansible jobs yet." />}
        columns={jobCols}
        keyFn={(item) => item.name}
        autoHidePagination={true}
        initialSort={{
          index: 1,
          direction: 'desc',
        }}
      />
      <div style={{ display: 'flex', position: 'fixed', bottom: 0, padding: '1rem 0' }}>
        <Button
          variant="primary"
          onClick={() =>
            navigate(
              generatePath(NavigationPath.editPolicyAutomation, {
                namespace: policy.metadata.namespace!,
                name: policy.metadata.name!,
              })
            )
          }
        >
          {'Edit'}
        </Button>
        {/* 16px is standard pf button spacing */}
        <div style={{ width: '16px' }} />
        <Button variant="secondary" onClick={onClose}>
          {'Cancel'}
        </Button>
        {/* 16px is standard pf button spacing */}
        <div style={{ width: '16px' }} />
        <Button
          variant="danger"
          onClick={() =>
            setModalProps({
              icon: 'danger',
              open: true,
              title: t('Permanently delete policy automation?'),
              action: t('Delete'),
              processing: t('Deleting'),
              items: [policyAutomationMatch],
              emptyState: undefined, // there is always 1 item supplied
              description: (
                <Text>
                  <Trans
                    i18nKey="Deleting <italic>{{policyAutomation}}</italic> is irreversible. Any associated Ansible job will be deleted."
                    values={{ policyAutomation: policyAutomationMatch.metadata.name! }}
                    components={{ italic: <em /> }}
                  />
                </Text>
              ),
              keyFn: (policyAutomationMatch: PolicyAutomation) => policyAutomationMatch.metadata.uid as string,
              actionFn: (policyAutomationMatch) => {
                const jobMatches = ansibleJobs.filter(
                  (job) =>
                    job.metadata.name === policyAutomationMatch.spec.automationDef.name &&
                    job.metadata.namespace === policyAutomationMatch.metadata.namespace
                )
                for (const job of jobMatches) {
                  deleteResource(job)
                }
                return deleteResource(policyAutomationMatch)
              },
              close: () => {
                setModalProps({ open: false })
                onClose()
              },
              onCancel: () => {
                setModalProps({ open: false })
              },
            })
          }
        >
          {'Delete'}
        </Button>
      </div>
    </div>
  )
}
