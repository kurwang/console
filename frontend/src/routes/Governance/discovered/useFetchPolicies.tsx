/* Copyright Contributors to the Open Cluster Management project */
// This react hook will be tested in e2e test(Cypress) due to its use of workers and blobs.
import { useEffect, useState } from 'react'
import { grouping } from './grouping'
import { useRecoilValue, useSharedAtoms } from '../../../shared-recoil'
import { SearchInput, useSearchResultItemsAndRelatedItemsQuery } from '../../Search/search-sdk/search-sdk'
import { searchClient } from '../../Search/search-sdk/search-client'
import {
  parseDiscoveredPolicies,
  parseDiscoveredPolicyLabels,
  resolveSource,
  getSourceText,
  parseStringMap,
} from '../common/util'
export interface ISourceType {
  type: string //ex: 'Policy' | 'Git' | 'Multiple'
  parentNs: string
  parentName: string
}
export interface DiscoveredPolicyItem {
  _uid: string
  _hubClusterResource: boolean
  kind: string
  apigroup: string
  apiversion: string
  cluster: string
  compliant?: string
  responseAction: string
  severity?: string
  _isExternal?: boolean
  annotation?: string
  created: string
  label?: string
  kind_plural: string
  // This is undefined on Gatekeeper constraints
  namespace?: string
  name: string
  disabled?: boolean
  // These are only for Operator policy
  deploymentAvailable?: boolean
  upgradeAvailable?: boolean
  // This is only for Gatekeeper constraints
  totalViolations?: number
  // Not from search-collector. Attached in grouping function
  source?: ISourceType
  // ValidatingAdmissionPolicyBinding
  policyName?: string
  _ownedByGatekeeper?: boolean
  validationActions?: string
  // Kyverno resources: ClusterPolicy, Policy
  validationFailureAction?: string
  _missingResources?: string
  _nonCompliantResources?: string
}

export interface DiscoveredPolicyTableItem {
  id: string
  name: string
  severity: string
  apigroup: string
  kind: string
  responseAction: string
  policies: DiscoveredPolicyItem[]
  source?: ISourceType
}

// If id (`policyName` + `policyKind` + `apiGroup`) exists, it returns a filtered `DiscoveredPolicyTable` based on `clusterName`.
export function useFetchPolicies(policyName?: string, policyKind?: string, apiGroup?: string) {
  const [isFetching, setIsFetching] = useState(true)
  const [policyItems, setPolicyItems] = useState<DiscoveredPolicyTableItem[]>()
  const [relatedResources, setRelatedResources] = useState<any[]>()
  const [labelData, setLabelData] = useState<{
    labelOptions: { label: string; value: string }[]
    labelMap: Record<string, { pairs: Record<string, string>; labels: string[] }>
  }>()
  const { channelsState, helmReleaseState, subscriptionsState } = useSharedAtoms()
  const helmReleases = useRecoilValue(helmReleaseState)
  const subscriptions = useRecoilValue(subscriptionsState)
  const channels = useRecoilValue(channelsState)

  let searchQuery: SearchInput[]

  const discoveredRelatedKinds = (apiGroup: string, kind: string) => {
    if (apiGroup === 'kyverno.io') {
      if (policyName) {
        return [] // All resources when the page is specific to one kyverno policy
      } else {
        return ['ClusterPolicyReport', 'PolicyReport'] // only reports when looking at multiple policies
      }
    }

    if (kind == 'CertificatePolicy') {
      return ['Secret']
    }

    // returns all
    return []
  }

  // `relatedKinds: ['$DO-NOT-RETURN']` is a workaround to not return related items since they aren't needed in those
  // parts of the query and no kind will ever match $DO-NOT-RETURN. Setting null or an empty list returns all
  // related items.
  if (policyName && policyKind && apiGroup) {
    searchQuery = [
      {
        filters: [
          {
            property: 'apigroup',
            values: [apiGroup],
          },
          {
            property: 'name',
            values: [policyName],
          },
          {
            property: 'kind',
            values: [policyKind],
          },
        ],
        relatedKinds: discoveredRelatedKinds(apiGroup, policyKind),
        limit: 100000,
      },
    ]
  } else {
    searchQuery = [
      {
        filters: [
          {
            property: 'apigroup',
            values: ['policy.open-cluster-management.io'],
          },
          {
            property: 'kind',
            values: ['CertificatePolicy', 'ConfigurationPolicy', 'OperatorPolicy'],
          },
        ],
        relatedKinds: ['$DO-NOT-RETURN'],
        limit: 100000,
      },
      // Query for all Gatekeeper Constraints
      {
        filters: [
          {
            property: 'apigroup',
            values: ['constraints.gatekeeper.sh'],
          },
        ],
        relatedKinds: ['$DO-NOT-RETURN'],
        limit: 100000,
      },
      {
        filters: [
          {
            property: 'apigroup',
            values: ['mutations.gatekeeper.sh'],
          },
        ],
        relatedKinds: ['$DO-NOT-RETURN'],
        limit: 100000,
      },
      {
        filters: [
          {
            property: 'apigroup',
            values: ['admissionregistration.k8s.io'],
          },
          {
            property: 'kind',
            values: ['ValidatingAdmissionPolicyBinding'],
          },
        ],
        relatedKinds: ['$DO-NOT-RETURN'],
        limit: 100000,
      },
      {
        filters: [
          {
            property: 'apigroup',
            values: ['kyverno.io'],
          },
          {
            property: 'kind',
            values: ['ClusterPolicy', 'Policy'],
          },
        ],
        relatedKinds: ['ClusterPolicyReport', 'PolicyReport'],
        limit: 100000,
      },
    ]
  }

  const {
    data: searchData,
    loading: searchLoading,
    error: searchErr,
  } = useSearchResultItemsAndRelatedItemsQuery({
    client: process.env.NODE_ENV === 'test' ? undefined : searchClient,
    variables: { input: searchQuery },
    pollInterval: 15000, // Poll every 15 seconds
  })

  useEffect(() => {
    if (searchErr && !searchLoading) {
      setIsFetching(false)
    }

    if (searchData?.searchResult?.length == 0 && !searchErr && !searchLoading) {
      setPolicyItems([])
      setRelatedResources([])
      setIsFetching(false)
    }

    if (searchData?.searchResult?.length !== 0 && !searchErr && !searchLoading) {
      const dataObj = '(' + grouping + ')();'
      // for firefox
      const blob = new Blob([dataObj.replace('"use strict";', '')], { type: 'application/javascript' })
      const blobURL = (window.URL ? URL : webkitURL).createObjectURL(blob)
      // Worker for discovered policies table
      const worker = new Worker(blobURL)

      worker.onmessage = (e: MessageEvent<any>) => {
        const parsedData = parseDiscoveredPolicies(e.data.policyItems) as DiscoveredPolicyTableItem[]
        setPolicyItems(parsedData)
        setRelatedResources(e.data.relatedResources)
        setLabelData(parseDiscoveredPolicyLabels(parsedData))
        setIsFetching(false)
      }

      worker.postMessage({
        data: searchData,
        subscriptions,
        helmReleases,
        channels,
        resolveSourceStr: resolveSource.toString(),
        getSourceTextStr: getSourceText.toString(),
        parseStringMapStr: parseStringMap.toString(),
        parseDiscoveredPoliciesStr: parseDiscoveredPolicies.toString(),
      })

      return () => {
        worker.terminate()
      }
    }
  }, [
    channelsState,
    helmReleaseState,
    subscriptionsState,
    searchData,
    searchErr,
    searchLoading,
    subscriptions,
    helmReleases,
    channels,
  ])

  return { isFetching, policyItems, relatedResources, err: searchErr, labelData }
}
