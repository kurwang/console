/* Copyright Contributors to the Open Cluster Management project */
import { fitContent } from '@patternfly/react-table'
import jsYaml from 'js-yaml'
import { Dispatch, SetStateAction, useMemo } from 'react'
import { TFunction } from 'react-i18next'
import { generatePath, Link, NavigateFunction } from 'react-router-dom-v5-compat'
import { BulkActionModalProps } from '../../components/BulkActionModal'
import { RbacDropdown } from '../../components/Rbac'
import AcmTimestamp from '../../lib/AcmTimestamp'
import { rbacDelete, rbacGet, rbacPatch } from '../../lib/rbac-util'
import { NavigationPath } from '../../NavigationPath'
import { AccessControl } from '../../resources/access-control'
import { Cluster, createDownloadFile, deleteResource, getISOStringTimestamp } from '../../resources/utils'
import { AcmLabels, compareStrings } from '../../ui-components'
import { useRecoilValue, useSharedAtoms } from '../../shared-recoil'

const LABELS_LENGTH = 5
const EXPORT_FILE_PREFIX = 'access-control-management'

type AccessControlManagementTableHelperProps = {
  t: TFunction
  setModalProps: Dispatch<SetStateAction<BulkActionModalProps<AccessControl> | { open: false }>>
  navigate: NavigateFunction
}

const ACTIONS = {
  EDIT: ({
    accessControl,
    navigate,
  }: { accessControl: AccessControl } & Pick<AccessControlManagementTableHelperProps, 'navigate'>) => {
    navigate(
      generatePath(NavigationPath.editAccessControlManagement, {
        id: accessControl.metadata?.uid!,
      })
    )
  },
  DELETE: ({
    accessControls,
    t,
    setModalProps,
  }: { accessControls: AccessControl[] } & Pick<AccessControlManagementTableHelperProps, 't' | 'setModalProps'>) => {
    setModalProps({
      open: true,
      title: t('Permanently delete Access Controls?'),
      action: t('Delete'),
      processing: t('Deleting'),
      items: [...accessControls],
      emptyState: undefined, // table action is only enabled when items are selected
      description: t(
        'You cannot create new clusters from deleted Access Controls. Clusters that you previously created will not be affected.'
      ),
      columns: [
        {
          header: t('ID'),
          sort: 'metadata.uid',
          search: 'metadata.uid',
          cell: (accessControl: AccessControl) => accessControl.metadata?.uid,
        },
        {
          header: t('Cluster'),
          sort: 'metadata.namespace',
          search: 'metadata.namespace',
          cell: (accessControl: AccessControl) => accessControl.metadata?.namespace,
        },
        {
          header: t('Created'),
          sort: 'metadata.creationTimestamp',
          cell: COLUMN_CELLS.CREATION_DATE,
        },
      ],
      keyFn: (accessControl: AccessControl) => accessControl.metadata?.uid! as string,
      actionFn: deleteResource,
      close: () => setModalProps({ open: false }),
      isDanger: true,
    })
  },
  EXPORT_YAML: (accessControl: AccessControl, exportFilePrefix: string) => {
    // TODO: assure proper content from the AccessControl
    const yamlContent = jsYaml.dump(accessControl)
    const fileName = `${exportFilePrefix}-${accessControl.metadata?.uid}-${Date.now()}.yaml`
    createDownloadFile(fileName, yamlContent, 'application/yaml')
  },
}

const COLUMN_CELLS = {
  ID: (accessControl: AccessControl) => (
    <span style={{ whiteSpace: 'nowrap' }}>
      <Link
        to={generatePath(NavigationPath.viewAccessControlManagement, {
          id: accessControl.metadata?.uid!,
        })}
      >
        {accessControl.metadata?.uid}
      </Link>
    </span>
  ),
  CLUSTER: (accessControl: AccessControl) => (
    <span style={{ whiteSpace: 'nowrap' }}>
      {accessControl.metadata?.namespace ? (
        <Link
          to={generatePath(NavigationPath.clusterDetails, {
            name: accessControl.metadata?.namespace!,
            namespace: accessControl.metadata?.namespace!,
          })}
        >
          {accessControl.metadata?.namespace}
        </Link>
      ) : (
        '-'
      )}
    </span>
  ),
  USER_GROUP: (accessControl: AccessControl, t: TFunction) => {
    // TODO: translate kind
    const rollBindingsSubjectNames =
      accessControl.spec.roleBindings
        ?.filter((e) => e.subject?.kind && e.subject?.name)
        .map((e) => `${e.subject?.kind}: ${e.subject?.name}`) ?? []

    const clusterRollBindingSubjectName =
      accessControl.spec.clusterRoleBinding?.subject?.kind && accessControl.spec.clusterRoleBinding?.subject?.name
        ? `${accessControl.spec.clusterRoleBinding.subject.kind}: ${accessControl.spec.clusterRoleBinding.subject.name}`
        : undefined

    const users_groups = [
      ...rollBindingsSubjectNames,
      ...(clusterRollBindingSubjectName ? [clusterRollBindingSubjectName] : []),
    ]
    return users_groups ? (
      <AcmLabels
        labels={users_groups}
        expandedText={t('Show less')}
        collapsedText={t('show.more', { count: users_groups.length })}
        // TODO: To properly translate 'count.items'
        allCollapsedText={t('count.items', { count: users_groups.length })}
        isCompact={users_groups.length > LABELS_LENGTH}
      />
    ) : (
      <span style={{ whiteSpace: 'nowrap' }}>'-'</span>
    )
  },
  ROLES: (accessControl: AccessControl, t: TFunction) => {
    const roleBindingRoles = accessControl.spec.roleBindings?.map((e) => e.roleRef.name) ?? []
    const clusterRoleBindingRole = accessControl.spec.clusterRoleBinding?.roleRef?.name
    const roles = [...roleBindingRoles, clusterRoleBindingRole].filter((role) => role !== undefined)
    return roles ? (
      <AcmLabels
        labels={roles}
        expandedText={t('Show less')}
        collapsedText={t('show.more', { count: roles.length })}
        // TODO: To properly translate 'count.items'
        allCollapsedText={t('count.items', { count: roles.length })}
        isCompact={roles.length > LABELS_LENGTH}
      />
    ) : (
      <span style={{ whiteSpace: 'nowrap' }}>'-'</span>
    )
  },
  NAMESPACES: (accessControl: AccessControl, t: TFunction) => {
    const rollBindingNamespaces = accessControl.spec.roleBindings?.map((e) => e.namespace) ?? []
    const namespaces = [
      ...rollBindingNamespaces,
      ...(accessControl.spec.clusterRoleBinding?.roleRef ? ['All Namespaces'] : []),
    ]
    return namespaces ? (
      <AcmLabels
        labels={namespaces}
        expandedText={t('Show less')}
        collapsedText={t('show.more', { count: namespaces.length })}
        // TODO: To properly translate 'count.items'
        allCollapsedText={t('count.items', { count: namespaces.length })}
        isCompact={namespaces.length > LABELS_LENGTH}
      />
    ) : (
      <span style={{ whiteSpace: 'nowrap' }}>'-'</span>
    )
  },
  CREATION_DATE: (accessControl: AccessControl) => (
    <span style={{ whiteSpace: 'nowrap' }}>
      <AcmTimestamp timestamp={accessControl.metadata?.creationTimestamp} />
    </span>
  ),
  ACTIONS: (
    accessControl: AccessControl,
    t: AccessControlManagementTableHelperProps['t'],
    setModalProps: AccessControlManagementTableHelperProps['setModalProps'],
    navigate: AccessControlManagementTableHelperProps['navigate']
  ) => (
    <RbacDropdown<AccessControl>
      id={`${accessControl.metadata?.uid}-actions`}
      item={accessControl}
      isKebab={true}
      text={t('Actions')}
      actions={[
        {
          id: 'editAccessControl',
          text: t('Edit Access Control'),
          isAriaDisabled: true,
          click: (accessControl) => ACTIONS.EDIT({ accessControl, navigate }),
          rbac: [rbacPatch(accessControl)], // TODO: is this the proper way for checking RBAC
        },
        {
          id: 'deleteAccessControl',
          text: t('Delete Access Control'),
          isAriaDisabled: true,
          click: (accessControl) => ACTIONS.DELETE({ accessControls: [accessControl], setModalProps, t }),
          rbac: [rbacDelete(accessControl)],
        },
        {
          id: 'exportAccessControl',
          text: t('Export to YAML'),
          isAriaDisabled: true,
          click: (accessControl) => ACTIONS.EXPORT_YAML(accessControl, EXPORT_FILE_PREFIX),
          rbac: [rbacGet(accessControl)],
        },
      ]}
    />
  ),
}

const accessControlTableColumns = ({ t, setModalProps, navigate }: AccessControlManagementTableHelperProps) => [
  {
    header: t('ID'),
    sort: 'metadata.uid',
    search: 'metadata.uid',
    cell: COLUMN_CELLS.ID,
    exportContent: (accessControl: AccessControl) => accessControl.metadata?.uid!,
  },
  {
    header: t('Cluster'),
    sort: 'metadata.namespace',
    search: 'metadata.namespace',
    cell: COLUMN_CELLS.CLUSTER,
    exportContent: (accessControl: AccessControl) => accessControl.metadata?.namespace, // TODO: to clarify
  },
  {
    header: t('Users/Groups'),
    // TODO: users or groups
    search: (accessControl: AccessControl) => {
      const roleBindingUsers = accessControl.spec.roleBindings?.map((e) => e.subject?.name).join() ?? ''
      const clusterRoleBindingUser = accessControl.spec.clusterRoleBinding?.subject?.name ?? ''
      return `${roleBindingUsers},${clusterRoleBindingUser}`
    },
    cell: (accessControl: AccessControl) => COLUMN_CELLS.USER_GROUP(accessControl, t),
    exportContent: (accessControl: AccessControl) => {
      const roleBindingUsers = accessControl.spec.roleBindings?.map((e) => e.subject?.name ?? '') ?? []
      const clusterRoleBindingUser = accessControl.spec.clusterRoleBinding?.subject?.name ?? ''
      return [...new Set([...roleBindingUsers, clusterRoleBindingUser])]
    },
  },
  {
    header: t('Roles'),
    search: (accessControl: AccessControl) => {
      const roleBindingRoles = accessControl.spec.roleBindings?.map((e) => e.roleRef.name).join() ?? ''
      const clusterRoleBindingRole = accessControl.spec.clusterRoleBinding?.roleRef?.name ?? ''
      return `${roleBindingRoles},${clusterRoleBindingRole}`
    },
    cell: (accessControl: AccessControl) => COLUMN_CELLS.ROLES(accessControl, t),
    exportContent: (accessControl: AccessControl) => {
      const roleBindingRoles = accessControl.spec.roleBindings?.map((e) => e.roleRef.name) ?? []
      const clusterRoleBindingRole = accessControl.spec.clusterRoleBinding?.roleRef?.name ?? ''
      return [...new Set([...roleBindingRoles, clusterRoleBindingRole])]
    },
  },
  {
    header: t('Namespaces'),
    search: (accessControl: AccessControl) => {
      const roleBindingNamespaces = accessControl.spec.roleBindings?.map((e) => e.namespace).join() ?? ''
      const clusterRoleBindingNamespace = accessControl.spec.clusterRoleBinding?.roleRef ? 'All Namespaces' : ''
      return `${roleBindingNamespaces},${clusterRoleBindingNamespace}`
    },
    cell: (accessControl: AccessControl) => COLUMN_CELLS.NAMESPACES(accessControl, t),
    exportContent: (accessControl: AccessControl) => {
      const roleBindingNamespaces = accessControl.spec.roleBindings?.map((e) => e.namespace) ?? []
      const clusterRoleBindingNamespace = accessControl.spec.clusterRoleBinding?.roleRef ? 'All Namespaces' : ''
      return [...new Set([...roleBindingNamespaces, clusterRoleBindingNamespace])]
    },
  },
  {
    header: t('Created'),
    sort: 'metadata.creationTimestamp',
    cell: COLUMN_CELLS.CREATION_DATE,
    exportContent: (accessControl: AccessControl) =>
      accessControl.metadata?.creationTimestamp ? getISOStringTimestamp(accessControl.metadata?.creationTimestamp) : '',
  },
  {
    header: '',
    cellTransforms: [fitContent],
    cell: (accessControl: AccessControl) => COLUMN_CELLS.ACTIONS(accessControl, t, setModalProps, navigate),
  },
]

const useFilters = ({
  managedClusters,
  accessControls,
  t,
}: {
  managedClusters: Cluster[]
  accessControls: AccessControl[] | undefined
  t: TFunction
}) => {
  return useMemo(
    () => [
      {
        id: 'cluster',
        label: t('Cluster'),
        options: Object.values(managedClusters)
          .map((cluster) => ({
            label: cluster.name,
            value: cluster.name,
          }))
          .sort((lhs, rhs) => compareStrings(lhs.label, rhs.label)),
        tableFilterFn: (selectedValues: string[], item: AccessControl) =>
          selectedValues.some((e) => item.spec.roleBindings?.map((e) => e.namespace).includes(e)),
      },
      {
        id: 'user',
        label: t('access.add.user'),
        options: [
          ...new Set(
            accessControls?.flatMap(
              (accessControl) =>
                accessControl.spec.roleBindings
                  ?.filter((e) => e.subject?.kind === 'User')
                  .map((e) => e.subject?.name) ?? []
            )
          ),
        ]
          .map((e) => ({ label: e, value: e }))
          .sort((lhs, rhs) => compareStrings(lhs.label, rhs.label)),
        tableFilterFn: (selectedValues: string[], item: AccessControl) =>
          selectedValues.some((e) =>
            item.spec.roleBindings
              ?.filter((e) => e.subject?.kind === 'User')
              .map((e) => e.subject?.name)
              .includes(e)
          ),
      },
      {
        id: 'group',
        label: t('access.add.group'),
        options: [
          ...new Set(
            accessControls?.flatMap(
              (accessControl) =>
                accessControl.spec.roleBindings
                  ?.filter((e) => e.subject?.kind === 'User')
                  .map((e) => e.subject?.name) ?? []
            )
          ),
        ]
          .map((e) => ({ label: e, value: e }))
          .sort((lhs, rhs) => compareStrings(lhs.label, rhs.label)),
        tableFilterFn: (selectedValues: string[], item: AccessControl) =>
          selectedValues.some((e) =>
            item.spec.roleBindings
              ?.filter((e) => e.subject?.kind === 'User')
              .map((e) => e.subject?.name)
              .includes(e)
          ),
      },
      {
        id: 'role',
        label: t('Role'),
        options: [
          ...new Set(
            accessControls?.flatMap(
              (accessControl) =>
                accessControl.spec.roleBindings?.filter((e) => e.roleRef.kind === 'Role').map((e) => e.subject?.name) ??
                []
            )
          ),
        ]
          .map((e) => ({ label: e, value: e }))
          .sort((lhs, rhs) => compareStrings(lhs.label, rhs.label)),
        tableFilterFn: (selectedValues: string[], item: AccessControl) =>
          selectedValues.some((e) =>
            item.spec.roleBindings
              ?.filter((e) => e.roleRef.kind === 'Role')
              .map((e) => e.subject?.name)
              .includes(e)
          ),
      },
    ],
    [t, managedClusters, accessControls]
  )
}

export { accessControlTableColumns, ACTIONS, COLUMN_CELLS, EXPORT_FILE_PREFIX, useFilters }

export function useAccessControlFilter() {
  const { accessControlState } = useSharedAtoms()
  const allAccessControls = useRecoilValue(accessControlState)
  const filters = ['kubevirt.io:view', 'kubevirt.io:edit', 'kubevirt.io:admin']
  const roleBindingMatches = allAccessControls.filter((ac) =>
    ac.spec.roleBindings?.some((rb) => filters.includes(rb.roleRef.name))
  )
  const clusterRoleBindingMatches = allAccessControls.filter(
    (ac) => ac.spec.clusterRoleBinding?.roleRef?.name && filters.includes(ac.spec.clusterRoleBinding.roleRef.name)
  )
  return [...new Set([...roleBindingMatches, ...clusterRoleBindingMatches])]
}
