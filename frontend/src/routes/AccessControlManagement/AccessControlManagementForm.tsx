/* Copyright Contributors to the Open Cluster Management project */
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { generatePath, useNavigate } from 'react-router-dom-v5-compat'
import { AcmDataFormPage } from '../../components/AcmDataForm'
import { FormData } from '../../components/AcmFormData'
import { LostChangesContext } from '../../components/LostChanges'
import { useTranslation } from '../../lib/acm-i18next'
import { NavigationPath, useBackCancelNavigation } from '../../NavigationPath'
import { IResource, listGroups, listUsers } from '../../resources'
import { AccessControl, AccessControlApiVersion, RoleBinding } from '../../resources/access-control'
import { createResource, patchResource } from '../../resources/utils'
import { AcmToastContext } from '../../ui-components'
import { useAllClusters } from '../Infrastructure/Clusters/ManagedClusters/components/useAllClusters'
import { useSearchCompleteLazyQuery } from '../Search/search-sdk/search-sdk'
import { searchClient } from '../Search/search-sdk/search-client'
import { useQuery } from '../../lib/useQuery'
import schema from './schema.json'
import { RoleBindingSection } from './RoleBindingSection'

const AccessControlManagementForm = ({
  isEditing,
  isViewing,
  handleModalToggle,
  hideYaml,
  accessControl,
  namespaces: namespacesProp,
  isCreatable,
}: {
  isEditing: boolean
  isViewing: boolean
  isCreatable: boolean
  handleModalToggle?: () => void
  hideYaml?: boolean
  accessControl?: AccessControl
  namespaces?: string[]
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { back, cancel } = useBackCancelNavigation()
  const toastContext = useContext(AcmToastContext)

  // Data
  const managedClusters = useAllClusters(true)
  const roles = [
    { id: '1', value: 'kubevirt.io:view' },
    { id: '2', value: 'kubevirt.io:edit' },
    { id: '3', value: 'kubevirt.io:admin' },
  ]
  const { data: users, startPolling: usersStartPolling, stopPolling: usersStopPolling } = useQuery(listUsers)
  const { data: groups, startPolling: groupsStartPolling, stopPolling: groupsStopPolling } = useQuery(listGroups)

  useEffect(() => {
    usersStartPolling()
    groupsStartPolling()
    return () => {
      usersStopPolling()
      groupsStopPolling()
    }
  }, [groupsStartPolling, groupsStopPolling, usersStartPolling, usersStopPolling])

  // General ClusterPermission states
  const [namespace, setNamespace] = useState('')
  const [createdDate, setCreatedDate] = useState('')
  const [name, setName] = useState('')

  // RoleBinding states
  const [selectedRoleBindings, setSelectedRoleBindings] = useState<RoleBinding[]>([])
  const [rbSelectedSubjectNames, setRbSelectedSubjectNames] = useState<string[]>([])
  const [rbSelectedUsers, setRbSelectedUsers] = useState<string[]>([])
  const [rbSelectedGroups, setRbSelectedGroups] = useState<string[]>([])
  const [rbSelectedRoleNames, setRbSelectedRoleNames] = useState<string[]>([])
  const [rbSelectedNamespaces, setRbSelectedNamespaces] = useState<string[]>([])
  const [rbSelectedSubjectType, setRbSelectedSubjectType] = useState<'User' | 'Group'>('User')

  // ClusterRoleBinding states
  const [crbSelectedSubjectNames, setCrbSelectedSubjectNames] = useState<string[]>([])
  const [crbSelectedUsers, setCrbSelectedUsers] = useState<string[]>([])
  const [crbSelectedGroups, setCrbSelectedGroups] = useState<string[]>([])
  const [crbSelectedRoleName, setCrbSelectedRoleName] = useState<string>('')
  const [crbSelectedSubjectType, setCrbSelectedSubjectType] = useState<'User' | 'Group'>('User')

  const { submitForm } = useContext(LostChangesContext)

  useEffect(() => {
    setName(accessControl?.metadata?.name ?? '')
    setNamespace(accessControl?.metadata?.namespace ?? '')
    setCreatedDate(accessControl?.metadata?.creationTimestamp ?? '')
    setSelectedRoleBindings((accessControl?.spec?.roleBindings ?? []) as RoleBinding[])

    if (accessControl?.spec?.roleBindings) {
      setRbSelectedSubjectNames([
        ...new Set(
          accessControl.spec.roleBindings
            .map((rb) => rb.subject?.name)
            .filter((name): name is string => name !== undefined)
        ),
      ])
      setRbSelectedRoleNames([...new Set(accessControl.spec.roleBindings.map((rb) => rb.roleRef.name))])
      setRbSelectedNamespaces([...new Set(accessControl.spec.roleBindings.map((rb) => rb.namespace))])
    }

    if (accessControl?.spec?.clusterRoleBinding) {
      setCrbSelectedSubjectNames([accessControl.spec.clusterRoleBinding.subject?.name ?? ''])
      setCrbSelectedRoleName(accessControl.spec.clusterRoleBinding.roleRef?.name ?? '')
    }
  }, [accessControl?.metadata, accessControl?.spec.clusterRoleBinding, accessControl?.spec.roleBindings])

  useEffect(() => {
    if (!isEditing && !isViewing && !selectedRoleBindings.length) {
      setSelectedRoleBindings([
        {
          namespace,
          roleRef: {
            name: '',
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'Role',
          },
          subject: {
            name: '',
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'User',
          },
        },
      ])
    }
  }, [isEditing, isViewing, namespace, selectedRoleBindings.length])

  const [getSearchResults, { data }] = useSearchCompleteLazyQuery({
    client: process.env.NODE_ENV === 'test' ? undefined : searchClient,
  })
  useEffect(() => {
    getSearchResults({
      client: process.env.NODE_ENV === 'test' ? undefined : searchClient,
      variables: {
        property: 'namespace',
        query: {
          keywords: [],
          filters: [
            {
              property: 'cluster',
              values: [namespace],
            },
          ],
        },
        limit: -1,
      },
    })
  }, [getSearchResults, namespace])

  useEffect(() => {
    switch (rbSelectedSubjectType) {
      case 'Group':
        setRbSelectedGroups(rbSelectedSubjectNames)
        break
      case 'User':
        setRbSelectedUsers(rbSelectedSubjectNames)
        break
    }
    switch (crbSelectedSubjectType) {
      case 'Group':
        setCrbSelectedGroups(crbSelectedSubjectNames)
        break
      case 'User':
        setCrbSelectedUsers(crbSelectedSubjectNames)
        break
    }
  }, [crbSelectedSubjectNames, crbSelectedSubjectType, rbSelectedSubjectNames, rbSelectedSubjectType])

  const namespaceItems: string[] = useMemo(
    () => data?.searchComplete?.filter((e) => e !== null) ?? [],
    [data?.searchComplete]
  )

  const { cancelForm } = useContext(LostChangesContext)
  const guardedHandleModalToggle = useCallback(() => cancelForm(handleModalToggle), [cancelForm, handleModalToggle])

  const stateToData = () => {
    const roleBindings = rbSelectedNamespaces.flatMap((ns) =>
      rbSelectedSubjectNames.flatMap((user) =>
        rbSelectedRoleNames.map((role) => ({
          namespace: ns,
          roleRef: {
            name: role,
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'Role',
          },
          subject: {
            name: user,
            apiGroup: 'rbac.authorization.k8s.io',
            kind: rbSelectedSubjectType,
          },
        }))
      )
    )

    const clusterRoleBinding =
      crbSelectedSubjectNames.length && crbSelectedRoleName
        ? {
            ...(accessControl?.spec.clusterRoleBinding?.name && {
              name: accessControl.spec.clusterRoleBinding.name,
            }),
            roleRef: {
              name: crbSelectedRoleName,
              apiGroup: 'rbac.authorization.k8s.io',
              kind: 'ClusterRole',
            },
            subject: {
              name: crbSelectedSubjectNames[0],
              apiGroup: 'rbac.authorization.k8s.io',
              kind: crbSelectedSubjectType,
            },
          }
        : undefined

    return [
      {
        apiVersion: AccessControlApiVersion,
        kind: accessControl ? accessControl?.kind : 'ClusterPermission',
        metadata: {
          name,
          namespace,
        },
        spec: {
          roleBindings,
          clusterRoleBinding,
        },
      },
    ]
  }

  const stateToSyncs = () => [
    { path: 'AccessControl[0].metadata.namespace', setState: setNamespace },
    { path: 'AccessControl[0].metadata.name', setState: setName },
    { path: 'AccessControl[0].spec.roleBindings', setState: setSelectedRoleBindings },
  ]

  const title = isViewing
    ? accessControl?.metadata?.uid!
    : isEditing
      ? t('Edit access control')
      : t('Add access control')
  const breadcrumbs = [{ text: t('Access Controls'), to: NavigationPath.accessControlManagement }, { text: title }]

  const namespaceOptions = (namespacesProp ?? managedClusters.map((c) => c.name)).map((ns) => ({
    id: ns,
    value: ns,
    text: ns,
  }))

  const formData: FormData = {
    title,
    description: t('An access control stores the... TO BE DEFINED'),
    breadcrumb: breadcrumbs,
    sections: [
      {
        type: 'Section',
        title: t('Basic information'),
        wizardTitle: t('Basic information'),
        inputs: [
          {
            id: 'namespace',
            type: 'Select',
            label: t('Cluster'),
            placeholder: 'Select or enter cluster name',
            value: namespace,
            onChange: (value) => {
              setNamespace(value)
            },
            options: namespaceOptions,
            isRequired: true,
          },
          {
            id: 'name',
            type: 'Text',
            label: 'Name',
            placeholder: 'Enter access control name',
            value: name,
            onChange: setName,
            isRequired: true,
          },
          {
            id: 'date',
            type: 'Text',
            label: t('Created at'),
            value: createdDate,
            onChange: setCreatedDate,
            isRequired: true,
            isDisabled: false,
            isHidden: isCreatable || isEditing,
          },
        ],
      },

      RoleBindingSection({
        title: 'Role Bindings',
        idPrefix: 'rb',
        isViewing,
        isRequired: !crbSelectedRoleName && !crbSelectedSubjectNames.length,
        selectedNamespaces: rbSelectedNamespaces,
        selectedSubjectNames: rbSelectedSubjectNames,
        selectedRoles: rbSelectedRoleNames,
        selectedSubjectType: rbSelectedSubjectType,
        namespaceOptions: namespaceItems.map((namespace) => ({
          id: namespace,
          value: namespace,
          text: namespace,
        })),
        roleOptions: roles.map((r) => ({ id: r.id, value: r.value })),
        subjectOptions: ((rbSelectedSubjectType === 'Group' ? groups : users) || []).map((val) => ({
          id: val.metadata.uid!,
          value: val.metadata.name!,
        })),
        onNamespaceChange: (values) => setRbSelectedNamespaces(values),
        onSubjectTypeChange: (value: string) => {
          setRbSelectedSubjectNames(value === 'group' ? rbSelectedGroups : rbSelectedUsers)
          setRbSelectedSubjectType(value === 'group' ? 'Group' : 'User')
        },
        onSubjectNameChange: (values) => setRbSelectedSubjectNames(values),
        onRoleChange: (values) => setRbSelectedRoleNames(values),
      }),

      RoleBindingSection({
        title: 'Cluster Role Binding',
        idPrefix: 'crb',
        isViewing,
        isRequired: !rbSelectedSubjectNames.length && !rbSelectedRoleNames.length,
        selectedNamespaces: ['All Namespaces'],
        selectedSubjectNames: crbSelectedSubjectNames,
        selectedRoles: crbSelectedRoleName ? [crbSelectedRoleName] : [],
        selectedSubjectType: crbSelectedSubjectType,
        namespaceOptions: [{ id: 'all', value: 'All Namespaces', text: 'All Namespaces', isDisabled: true }],
        roleOptions: roles.map((r) => ({ id: r.id, value: r.value })),
        subjectOptions: ((crbSelectedSubjectType === 'Group' ? groups : users) || []).map((val) => ({
          id: val.metadata.uid!,
          value: val.metadata.name!,
        })),
        onNamespaceChange: () => {},
        onSubjectTypeChange: (value: string) => {
          setCrbSelectedSubjectNames(value === 'group' ? crbSelectedGroups : crbSelectedUsers)
          setCrbSelectedSubjectType(value === 'group' ? 'Group' : 'User')
        },
        onSubjectNameChange: (values) => setCrbSelectedSubjectNames(values),
        onRoleChange: (values) => setCrbSelectedRoleName(values[0] || ''),
      }),
    ],

    submit: () => {
      let accessControlData = formData?.customData ?? stateToData()
      if (Array.isArray(accessControlData)) {
        accessControlData = accessControlData[0]
      }
      if (isEditing) {
        const accessControl = accessControlData as AccessControl
        const patch: { op: 'replace'; path: string; value: unknown }[] = []
        const metadata: AccessControl['metadata'] = accessControl.metadata!
        patch.push({ op: 'replace', path: `/spec/roleBindings`, value: accessControl.spec.roleBindings })
        return patchResource(accessControl, patch).promise.then(() => {
          toastContext.addAlert({
            title: t('Acccess Control updated'),
            message: t('accessControlForm.updated.message', { id: metadata.uid }),
            type: 'success',
            autoClose: true,
          })
          submitForm()
          navigate(NavigationPath.accessControlManagement)
        })
      } else {
        return createResource(accessControlData as IResource).promise.then((resource) => {
          toastContext.addAlert({
            title: t('Access Control created'),
            message: t('accessControlForm.created.message', { id: (resource as AccessControl).metadata?.uid }),
            type: 'success',
            autoClose: true,
          })
          submitForm()

          if (handleModalToggle) {
            handleModalToggle()
          } else {
            navigate(NavigationPath.accessControlManagement)
          }
        })
      }
    },
    submitText: isEditing ? t('Save') : t('Add'),
    submittingText: isEditing ? t('Saving') : t('Adding'),
    reviewTitle: t('Review your selections'),
    reviewDescription: t('Return to a step to make changes'),
    cancelLabel: t('Cancel'),
    nextLabel: t('Next'),
    backLabel: t('Back'),
    back: handleModalToggle ? guardedHandleModalToggle : back(NavigationPath.accessControlManagement),
    cancel: handleModalToggle ? guardedHandleModalToggle : cancel(NavigationPath.accessControlManagement),
    stateToSyncs,
    stateToData,
  }

  return (
    <AcmDataFormPage
      formData={formData}
      editorTitle={t('Access Control YAML')}
      schema={schema}
      mode={isViewing ? 'details' : isEditing ? 'form' : 'wizard'}
      hideYaml={hideYaml}
      secrets={[]}
      immutables={isEditing ? ['*.metadata.name', '*.metadata.namespace', '*.data.id', '*.data.creationTimestamp'] : []}
      edit={() =>
        navigate(
          generatePath(NavigationPath.editAccessControlManagement, {
            id: accessControl?.metadata?.uid!,
          })
        )
      }
      isModalWizard={!!handleModalToggle}
    />
  )
}

export { AccessControlManagementForm }
