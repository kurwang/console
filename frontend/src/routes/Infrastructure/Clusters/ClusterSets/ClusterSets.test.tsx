/* Copyright Contributors to the Open Cluster Management project */

import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { MemoryRouter, Route, Routes } from 'react-router-dom-v5-compat'
import { RecoilRoot } from 'recoil'
import {
  certificateSigningRequestsState,
  clusterDeploymentsState,
  managedClusterInfosState,
  managedClusterSetsState,
  managedClustersState,
} from '../../../../atoms'
import { nockCreate, nockDelete, nockIgnoreApiPaths, nockIgnoreRBAC } from '../../../../lib/nock-util'
import { defaultPlugin, PluginContext } from '../../../../lib/PluginContext'
import { mockManagedClusterSet, mockGlobalClusterSet } from '../../../../lib/test-metadata'
import {
  clickBulkAction,
  clickByText,
  selectTableRow,
  typeByText,
  waitForNock,
  waitForText,
  waitForNotText,
  typeByTestId,
  clickByLabel,
  getCSVExportSpies,
  getCSVDownloadLink,
} from '../../../../lib/test-util'
import {
  mockClusterDeployments,
  mockManagedClusterInfos,
  mockManagedClusters,
} from '../ManagedClusters/ManagedClusters.sharedmocks'
import { NavigationPath } from '../../../../NavigationPath'
import Clusters from '../Clusters'

const Component = () => (
  <RecoilRoot
    initializeState={(snapshot) => {
      snapshot.set(managedClusterSetsState, [mockManagedClusterSet, mockGlobalClusterSet])
      snapshot.set(clusterDeploymentsState, mockClusterDeployments)
      snapshot.set(managedClusterInfosState, mockManagedClusterInfos)
      snapshot.set(managedClustersState, mockManagedClusters)
      snapshot.set(certificateSigningRequestsState, [])
    }}
  >
    <MemoryRouter initialEntries={[NavigationPath.clusterSets]}>
      <Routes>
        <Route path={`${NavigationPath.clusters}/*`} element={<Clusters />} />
      </Routes>
    </MemoryRouter>
  </RecoilRoot>
)

describe('ClusterSets page', () => {
  beforeEach(() => {
    nockIgnoreRBAC()
    nockIgnoreApiPaths()
    render(<Component />)
  })
  test('renders', async () => {
    await waitForText(mockManagedClusterSet.metadata.name!)
    await waitForText(mockGlobalClusterSet.metadata.name!)
    await waitForText('Submariner')
  })
  test('can create a managed cluster set', async () => {
    await clickByText('Create cluster set')
    await waitForText('Cluster set name')
    await typeByTestId('clusterSetName', mockManagedClusterSet.metadata.name!)
    const createNock = nockCreate(mockManagedClusterSet)
    await clickByText('Create')
    await waitForNock(createNock)
    await waitForText('Cluster set successfully created')
  })
  test('can delete managed cluster sets with bulk actions', async () => {
    const nock = nockDelete(mockManagedClusterSet)
    await selectTableRow(2)
    await clickBulkAction('Delete cluster sets')
    await typeByText('Confirm by typing "confirm" below:', 'confirm')
    await clickByText('Delete')
    await waitForNock(nock)
  })
  test('cannot delete global cluster sets with bulk actions', async () => {
    expect(
      screen.getByRole('checkbox', {
        name: /select row 0/i,
      })
    ).toBeDisabled()
  })
})

describe('ClusterSets page without Submariner', () => {
  beforeEach(() => {
    nockIgnoreRBAC()
    nockIgnoreApiPaths()
    render(
      <PluginContext.Provider value={{ ...defaultPlugin, isSubmarinerAvailable: false }}>
        <Component />
      </PluginContext.Provider>
    )
  })
  test('renders', async () => {
    await waitForText(mockManagedClusterSet.metadata.name!)
    await waitForNotText('Submariner')
  })
})

describe('ClusterSets page with csv export', () => {
  beforeEach(() => {
    nockIgnoreRBAC()
    nockIgnoreApiPaths()
    render(
      <PluginContext.Provider value={{ ...defaultPlugin, isSubmarinerAvailable: false }}>
        <Component />
      </PluginContext.Provider>
    )
  })
  test('export button should produce a file for download', async () => {
    window.URL.createObjectURL = jest.fn()
    window.URL.revokeObjectURL = jest.fn()
    const { blobConstructorSpy, createElementSpy } = getCSVExportSpies()

    await clickByLabel('export-search-result')
    await clickByText('Export all to CSV')

    expect(blobConstructorSpy).toHaveBeenCalledWith(
      [
        'Name,Cluster status,Namespace bindings\n' +
          '"test-cluster-set","healthy: 0, running: 0, warning: 0, progress: 1, danger: 0, detached: 0, pending: 0, sleep: 0, unknown: 0",-\n' +
          '"global","healthy: 4, running: 0, warning: 0, progress: 1, danger: 1, detached: 0, pending: 0, sleep: 0, unknown: 0",-',
      ],
      { type: 'text/csv' }
    )
    expect(getCSVDownloadLink(createElementSpy)?.value.download).toMatch(/^clustersets-[\d]+\.csv$/)
  })
})
