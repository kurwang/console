/* Copyright Contributors to the Open Cluster Management project */
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { generatePath, useNavigate } from 'react-router-dom-v5-compat'
import { AcmDataFormPage } from '../../components/AcmDataForm'
import { FormData } from '../../components/AcmFormData'
import { LostChangesContext } from '../../components/LostChanges'
import { useTranslation } from '../../lib/acm-i18next'
import { useQuery } from '../../lib/useQuery'
import { NavigationPath, useBackCancelNavigation } from '../../NavigationPath'
import { IResource, listGroups, listUsers } from '../../resources'
import { AccessControl, AccessControlApiVersion, RoleBinding } from '../../resources/access-control'
import { createResource, patchResource } from '../../resources/utils'
import { AcmToastContext } from '../../ui-components'
import { useAllClusters } from '../Infrastructure/Clusters/ManagedClusters/components/useAllClusters'
import { searchClient } from '../Search/search-sdk/search-client'
import { useSearchCompleteLazyQuery } from '../Search/search-sdk/search-sdk'
import { RoleBindingHook } from './RoleBindingHook'
import { RoleBindingSection } from './RoleBindingSection'
import schema from './schema.json'

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
  const {
    selected: selectedRoleBindings,
    setSelected: setRBSelected,
    selectedSubjectType: rbSelectedSubjectType,
    selectedSubjectNames: rbSelectedSubjectNames,
    setSelectedSubjectNames: setRbSelectedSubjectNames,
    selectedRoleNames: rbSelectedRoleNames,
    setSelectedRoleNames: setRbSelectedRoleNames,
    selectedNamespaces: rbSelectedNamespaces,
    setSelectedNamespaces: setRbSelectedNamespaces,
    onNamespaceChange: onNamespaceChangeRB,
    onSubjectTypeChange: onSubjectTypeChangeRB,
    onSubjectNameChange: onSubjectNameChangeRB,
    onRoleChange: onRoleChangeRB,
  } = RoleBindingHook<RoleBinding>()

  // ClusterRoleBinding states
  const {
    selectedSubjectType: crbSelectedSubjectType,
    selectedSubjectNames: crbSelectedSubjectNames,
    setSelectedSubjectNames: setCrbSelectedSubjectNames,
    selectedRoleName: crbSelectedRoleName,
    setSelectedRoleName: setCrbSelectedRoleName,
    onSubjectTypeChange: onSubjectTypeChangeCRB,
    onSubjectNameChange: onSubjectNameChangeCRB,
    onRoleChange: onRoleChangeCRB,
  } = RoleBindingHook<string>()

  const { submitForm } = useContext(LostChangesContext)

  useEffect(() => {
    setName(accessControl?.metadata?.name ?? '')
    setNamespace(accessControl?.metadata?.namespace ?? '')
    setCreatedDate(accessControl?.metadata?.creationTimestamp ?? '')
  }, [accessControl?.metadata])

  useEffect(() => {
    setRBSelected((accessControl?.spec?.roleBindings ?? []) as RoleBinding[])
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
  }, [
    accessControl?.spec.roleBindings,
    setRbSelectedNamespaces,
    setRbSelectedRoleNames,
    setRbSelectedSubjectNames,
    setRBSelected,
  ])

  useEffect(() => {
    if (accessControl?.spec?.clusterRoleBinding) {
      setCrbSelectedSubjectNames([accessControl.spec.clusterRoleBinding.subject?.name ?? ''])
      setCrbSelectedRoleName(accessControl.spec.clusterRoleBinding.roleRef?.name ?? '')
    }
  }, [accessControl?.spec.clusterRoleBinding, setCrbSelectedRoleName, setCrbSelectedSubjectNames])

  useEffect(() => {
    if (!isEditing && !isViewing && !selectedRoleBindings.length) {
      setRBSelected([
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
  }, [isEditing, isViewing, namespace, selectedRoleBindings.length, setRBSelected])

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
    { path: 'AccessControl[0].spec.roleBindings', setState: setRBSelected },
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
        onNamespaceChange: onNamespaceChangeRB,
        onSubjectTypeChange: onSubjectTypeChangeRB,
        onSubjectNameChange: onSubjectNameChangeRB,
        onRoleChange: onRoleChangeRB,
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
        onSubjectTypeChange: onSubjectTypeChangeCRB,
        onSubjectNameChange: onSubjectNameChangeCRB,
        onRoleChange: onRoleChangeCRB,
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
