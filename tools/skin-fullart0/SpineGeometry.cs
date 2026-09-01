using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Spine;

public sealed class NoopTextureLoader : TextureLoader {
    public void Load(AtlasPage page, string path) { page.rendererObject = path; }
    public void Unload(object texture) { }
}

public static class SpineGeometryProgram {
    private static object AtlasRegionInfo(object rendererObject) {
        var region = rendererObject as AtlasRegion;
        if (region == null) return null;
        return new {
            name = region.name,
            page = region.page == null ? null : region.page.name,
            region.x, region.y, region.width, region.height,
            region.originalWidth, region.originalHeight,
            region.offsetX, region.offsetY, region.rotate,
            region.u, region.v, region.u2, region.v2,
        };
    }

    private static object Color(float r, float g, float b, float a) { return new { r, g, b, a }; }

    private static object SkinInfo(Skin skin) {
        if (skin == null) return null;
        var typeCounts = new Dictionary<string, int>();
        var entries = new List<object>();
        foreach (var entry in skin.Attachments) {
            var type = entry.Value == null ? null : entry.Value.GetType().Name;
            if (type != null) {
                typeCounts.TryGetValue(type, out var count);
                typeCounts[type] = count + 1;
            }
            entries.Add(new {
                slotIndex = entry.Key.slotIndex,
                name = entry.Key.name,
                attachmentType = type,
                attachmentName = entry.Value == null ? null : entry.Value.Name,
            });
        }
        return new {
            name = skin.Name,
            attachmentCount = skin.Attachments.Count,
            attachmentTypeCounts = typeCounts,
            attachments = entries,
        };
    }

    public static int Main(string[] args) {
        if (args.Length != 3) {
            Console.Error.WriteLine("usage: SpineGeometry <atlas> <skel> <output.json>");
            return 2;
        }

        var atlasPath = Path.GetFullPath(args[0]);
        var skeletonPath = Path.GetFullPath(args[1]);
        var outputPath = Path.GetFullPath(args[2]);
        var atlas = new Atlas(atlasPath, new NoopTextureLoader());
        var binary = new SkeletonBinary(atlas);
        var skeletonData = binary.ReadSkeletonData(skeletonPath);
        if (skeletonData.Version != "3.3.05")
            throw new Exception("version-matched renderer expected Spine 3.3.05 but got: " + skeletonData.Version);

        var skeleton = new Skeleton(skeletonData);
        skeleton.SetToSetupPose();
        skeleton.UpdateWorldTransform();

        var setupSlots = new List<object>();
        for (int i = 0; i < skeleton.Slots.Count; i++) {
            var slot = skeleton.Slots.Items[i];
            setupSlots.Add(new {
                index = i,
                slot = slot.Data.Name,
                setupAttachmentName = slot.Data.AttachmentName,
                currentAttachmentName = slot.Attachment == null ? null : slot.Attachment.Name,
                currentAttachmentType = slot.Attachment == null ? null : slot.Attachment.GetType().Name,
            });
        }

        var skins = new List<object>();
        for (int i = 0; i < skeletonData.Skins.Count; i++) skins.Add(SkinInfo(skeletonData.Skins.Items[i]));
        var animations = new List<string>();
        for (int i = 0; i < skeletonData.Animations.Count; i++) animations.Add(skeletonData.Animations.Items[i].Name);

        var renderables = new List<object>();
        var nonRenderAttachments = new List<object>();
        var blendModes = new HashSet<string>();
        var minX = float.PositiveInfinity;
        var minY = float.PositiveInfinity;
        var maxX = float.NegativeInfinity;
        var maxY = float.NegativeInfinity;
        int triangleCount = 0;
        int vertexCount = 0;

        var drawOrder = skeleton.DrawOrder;
        for (int drawIndex = 0; drawIndex < drawOrder.Count; drawIndex++) {
            var slot = drawOrder.Items[drawIndex];
            var attachment = slot.Attachment;
            if (attachment == null) continue;
            var blendMode = slot.Data.BlendMode.ToString();
            blendModes.Add(blendMode);

            if (attachment is RegionAttachment region) {
                region.UpdateOffset();
                var vertices = new float[8];
                region.ComputeWorldVertices(slot.Bone, vertices);
                var triangles = new int[] { 0, 1, 2, 2, 3, 0 };
                for (int i = 0; i < vertices.Length; i += 2) {
                    minX = Math.Min(minX, vertices[i]); minY = Math.Min(minY, vertices[i + 1]);
                    maxX = Math.Max(maxX, vertices[i]); maxY = Math.Max(maxY, vertices[i + 1]);
                }
                vertexCount += vertices.Length / 2; triangleCount += triangles.Length / 3;
                renderables.Add(new {
                    drawIndex, slot = slot.Data.Name, attachment = attachment.Name, type = "RegionAttachment", blendMode,
                    slotColor = Color(slot.R, slot.G, slot.B, slot.A),
                    attachmentColor = Color(region.R, region.G, region.B, region.A),
                    atlas = AtlasRegionInfo(region.RendererObject), vertices, uvs = region.UVs, triangles,
                });
            } else if (attachment is MeshAttachment mesh) {
                var vertices = new float[mesh.WorldVerticesLength];
                mesh.ComputeWorldVertices(slot, vertices);
                var triangles = mesh.Triangles ?? Array.Empty<int>();
                var uvs = mesh.UVs ?? Array.Empty<float>();
                for (int i = 0; i < vertices.Length; i += 2) {
                    minX = Math.Min(minX, vertices[i]); minY = Math.Min(minY, vertices[i + 1]);
                    maxX = Math.Max(maxX, vertices[i]); maxY = Math.Max(maxY, vertices[i + 1]);
                }
                vertexCount += vertices.Length / 2; triangleCount += triangles.Length / 3;
                renderables.Add(new {
                    drawIndex, slot = slot.Data.Name, attachment = attachment.Name, type = "MeshAttachment", blendMode,
                    slotColor = Color(slot.R, slot.G, slot.B, slot.A),
                    attachmentColor = Color(mesh.R, mesh.G, mesh.B, mesh.A),
                    atlas = AtlasRegionInfo(mesh.RendererObject), vertices, uvs, triangles,
                });
            } else {
                nonRenderAttachments.Add(new {
                    drawIndex, slot = slot.Data.Name, attachment = attachment.Name,
                    type = attachment.GetType().Name, blendMode,
                });
            }
        }

        var diagnostic = new {
            defaultSkin = SkinInfo(skeletonData.DefaultSkin),
            skins,
            setupSlots,
            setupSlotCount = skeleton.Slots.Count,
            setupNamedAttachmentCount = setupSlots.Count,
            setupResolvedAttachmentCount = skeleton.Slots.Count(slot => slot.Attachment != null),
        };

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        var options = new JsonSerializerOptions { WriteIndented = true };
        if (renderables.Count == 0 || triangleCount == 0) {
            var noRender = new {
                schemaVersion = 1,
                status = "DIAGNOSTIC_NO_SETUP_RENDERABLES",
                runtime = new {
                    source = "EsotericSoftware/spine-runtimes",
                    commit = "1c1936532527900f74cfb58f7002998bf157b254",
                    sourceCommitDate = "2016-06-30",
                    sourceCommitPurpose = "C# runtimes v3.3.x format including SkeletonBinary",
                },
                skeleton = new {
                    version = skeletonData.Version, hash = skeletonData.Hash,
                    setupWidth = skeletonData.Width, setupHeight = skeletonData.Height,
                    bones = skeletonData.Bones.Count, slots = skeletonData.Slots.Count,
                    skins = skeletonData.Skins.Count, animations, pose = "setup",
                },
                diagnostic,
                geometry = new {
                    renderableAttachmentCount = renderables.Count,
                    nonRenderAttachmentCount = nonRenderAttachments.Count,
                    vertexCount, triangleCount,
                    blendModes = blendModes.OrderBy(x => x).ToArray(),
                    renderables, nonRenderAttachments,
                },
            };
            File.WriteAllText(outputPath, JsonSerializer.Serialize(noRender, options) + Environment.NewLine);
            Console.WriteLine(JsonSerializer.Serialize(new {
                noRender.status,
                version = skeletonData.Version,
                defaultSkin = skeletonData.DefaultSkin == null ? null : skeletonData.DefaultSkin.Name,
                skinNames = skeletonData.Skins.Select(s => s.Name).ToArray(),
                slots = skeletonData.Slots.Count,
                setupResolvedAttachments = skeleton.Slots.Count(slot => slot.Attachment != null),
            }));
            return 3;
        }

        if (!float.IsFinite(minX) || !float.IsFinite(minY) || !float.IsFinite(maxX) || !float.IsFinite(maxY))
            throw new Exception("setup pose bounds are non-finite");

        var result = new {
            schemaVersion = 1,
            status = "PASS_VERSION_MATCHED_SPINE_GEOMETRY",
            runtime = new {
                source = "EsotericSoftware/spine-runtimes",
                commit = "1c1936532527900f74cfb58f7002998bf157b254",
                sourceCommitDate = "2016-06-30",
                sourceCommitPurpose = "C# runtimes v3.3.x format including SkeletonBinary",
            },
            skeleton = new {
                version = skeletonData.Version, hash = skeletonData.Hash,
                setupWidth = skeletonData.Width, setupHeight = skeletonData.Height,
                bones = skeletonData.Bones.Count, slots = skeletonData.Slots.Count,
                skins = skeletonData.Skins.Count, animations, pose = "setup",
            },
            diagnostic,
            geometry = new {
                renderableAttachmentCount = renderables.Count,
                nonRenderAttachmentCount = nonRenderAttachments.Count,
                vertexCount, triangleCount,
                blendModes = blendModes.OrderBy(x => x).ToArray(),
                bounds = new { minX, minY, maxX, maxY, width = maxX - minX, height = maxY - minY },
                renderables, nonRenderAttachments,
            },
        };
        File.WriteAllText(outputPath, JsonSerializer.Serialize(result, options) + Environment.NewLine);
        Console.WriteLine(JsonSerializer.Serialize(new {
            result.status, skeleton = new { skeletonData.Version, skeletonData.Width, skeletonData.Height },
            renderables = renderables.Count, triangleCount,
            bounds = new { minX, minY, maxX, maxY },
            blendModes = blendModes.OrderBy(x => x).ToArray(),
        }));
        return 0;
    }
}
