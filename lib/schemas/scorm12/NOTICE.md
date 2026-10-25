# SCORM 1.2 schema files

These three files are the XML Schema definitions a SCORM 1.2 manifest is written against. kiss copies them into a SCORM 1.2 package when `config.packages.schemas` is `true`, and its tests validate the manifests it writes against them.

| File                   | What it defines                                                                                              | Owner                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `imscp_rootv1p1p2.xsd` | IMS Content Packaging 1.1.2: the manifest, organizations, items and resources                                | IMS Global Learning Consortium, Inc. (now 1EdTech). Its header: "Copyright (c) 2001 IMS GLC, Inc." |
| `ims_xml.xsd`          | The `xml:` namespace attributes the content-packaging schema imports                                         | IMS Global Learning Consortium, Inc.                                                               |
| `adlcp_rootv1p2.xsd`   | ADL's SCORM 1.2 extensions: `adlcp:scormtype`, `adlcp:masteryscore`, the `ADL SCORM` / `1.2` metadata values | Advanced Distributed Learning (ADL) Initiative, a US Department of Defense programme               |

They are unchanged from the copies Rustici Software publishes as the SCORM 1.2 schema definition files (`https://scorm.com/wp-content/assets/SchemaDefinitionFiles/zips/scorm12schemadefinition.zip`, downloaded 2026-10-25), except that the repository stores text with LF line endings. None of the three states licence terms; they are the standard files SCORM 1.2 packages have carried since 2001, and they are distributed here, as there, for that purpose. The fourth file in that download, `imsmd_rootv1p2p1.xsd` (IMS metadata), is left out: kiss writes no IMS metadata, and none of these three imports it.

Do not edit them. A manifest that does not validate is kiss's to fix.
